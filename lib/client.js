const EventEmitter = require('events')
const WebSocket = require('ws')
const nonce = require('nonce')()
const logger = require('./logger')

let instances = 0

const jitterMin = 0
const jitterMax = 1000 * 60
const reconnectJitter = 1000
const taskRetryMax = 10
const maxInstances = 10
const maxSubscriptions = 49 // maximum # of topics a client can sub to (should be 50 but TPS kicks us out when the 50th subscription is attempted)

const defaultHost = 'wss://pubsub-edge.twitch.tv'

const defaultOptions = {
  debug: false,
  host: defaultHost,
  topics: [],
  exponentialBackoffMax: 1000 * 60 * 2,
  clientId: null //not currently used, will allow bypassing limits in future
}

class Client extends EventEmitter {
  constructor(opts={}) {
    super()
    const options = Object.assign({},defaultOptions,opts)
    if (instances >= maxInstances) {
      throw new Error(`Maximum number of simultaneous connections (${maxInstances}) for single IP reached. New client not created`)
    } else {
      if (options.topics.length > maxSubscriptions) {
          throw new Error(`Maximum amount of topics a client can subscribe to is ${maxSubscriptions}. Try splitting your topics across multiple clients`)
      }
      instances++

      const logLevel = options.debug ? 'info' : 'error'
      if (options.logger) {
        this.log = options.logger
      } else {
        this.log = new logger()
        this.log.setLevel(logLevel)
      }

      this.pongTimeout = null
      this.pingTimer = null
      this.reconnectTimer = null
      this.exponentialBackoff = 1000 * 1
      this.exponentialBackoffMax = options.exponentialBackoffMax
      this.topicMappingData = [...options.topics]
      this.hostName = options.host

      this.ws = new WebSocket(this.hostName)
      this._setupSocket()
    }
  }
  _setupSocket() {
    this.ws.on('open', () => {
      this.log.info('Connected')
      clearTimeout(this.reconnectTimer)
      this.subscribedTopics = []
      this.topicHandlers = {}
      this.nonceQueue = {}
      this.exponentialBackoff = 1000 * 1
      this.shouldReconnect = true
      this._initHandlers()
      this._sendPing()
      this._subscribeToQueuedTopics()
      this.emit('connected')
    })
    this.ws.on('error', (e) => {
      this.log.error(`Socket ERROR: err:${e}`)
    })
    this.ws.on('close', (code, msg) => {
      this.log.info(`Socket closed. Code:${code} Message:${msg}`)
      if (this.shouldReconnect) {
        this._handleReconnect()
      } else {
        this.log.info('Disconnected')
        instances--
      }
    })
  }
  _initHandlers() {
    this.ws.on('message', (data, flags) => {
      let message = null
      try {
        message = JSON.parse(data)
      } catch (e) {
        this.log.warn(`Received a message with malformed data. Rejecting!`)
        this.log.error(e)
        return 0
      }
      const msgType = message.type
      switch(msgType) {
        case 'PONG':
          this._handlePong()
          break
        case 'RECONNECT':
          this.ws.terminate()
          break
        case 'RESPONSE':
          this._handleResponse(message)
          break
        case 'MESSAGE':
          this._handleMessage(message)
          break
      }
    })
    this.log.info('PubSub message handlers initialized')
  }
  _getRandomJitter(type) {
    let maxVal = 0
    switch(type) {
      case 'ping':
        maxVal = jitterMax
        break
      case 'reconnect':
        maxVal = reconnectJitter
        break
    }
    return Math.random() * (maxVal - jitterMin + 1) + jitterMin
  }
  _sendPing() {
    this._sendData({ type: 'PING' }, (err) => {
      if (!err) {
        this.log.info('PING sent')
        this._armPongTimeout()
        this._scheduleNextPing()
      } else {
        this.log.error(err)
      }
    })
  }
  _scheduleNextPing() {
    const pingTimeout = (1000 * 60 * 4) + this._getRandomJitter('ping')
    this.log.info(`Next ping scheduled in ${pingTimeout}ms`)
    this.pingTimer = setTimeout(() => {
      this._sendPing()
    }, pingTimeout)
  }
  _armPongTimeout() {
    //by TPS spec if no PONG is received in 10 seconds, clients should
    //reconnect
    this.pongTimeout = setTimeout(() => {
      this._handlePingTimeout()
    },1000 * 10)
  }
  _handlePong() {
    this.log.info('PONG received')
    clearTimeout(this.pongTimeout)
  }
  _handlePingTimeout() {
    this.log.info('PING timed out')
    this.ws.terminate()
  }

  _subscribeToQueuedTopics() {
    this.log.info('Subscribing to queued topics')
    for (let topic of this.topicMappingData) {
      this.subscribe(topic.topic, topic.handler, topic.auth_token)
    }
  }
  _handleReconnect() {
    this.log.info('Reconnecting!')
    clearTimeout(this.pongTimeout)
    clearTimeout(this.pingTimer)
    const waitTime = this.exponentialBackoff
                    + this._getRandomJitter('reconnect')
    if (this.exponentialBackoff < this.exponentialBackoffMax) {
      this.exponentialBackoff*=2
    } else {
      this.exponentialBackoff = this.exponentialBackoffMax
    }
    this.reconnectTimer = setTimeout(() => {
      this.ws = new WebSocket(this.hostName)
      this._setupSocket()
    },waitTime)
  }
  _handleResponse(response) {
    this.log.info('Response received')
    const respNonce = response.nonce
    const queueItem = this.nonceQueue[respNonce]
    if (queueItem) {
      if (response.error) {
        this.log.error(`Action "${queueItem.action}" for topic "${queueItem.topic}" failed. Error: ${response.error}`)
        queueItem.reject({
          error: response.error,
          message: `Unable to apply action "${queueItem.action}" to topic: ${queueItem.topic}. Reason: ${response.error}!`
        })
        delete this.nonceQueue[respNonce]
      } else {
        if (queueItem.action === 'sub') {
          this._storeTopicMapping(queueItem.topic, queueItem.handler, queueItem.auth_token)
          this.subscribedTopics.push(queueItem.topic)
          this.topicHandlers[queueItem.topic] = queueItem.handler
          delete this.nonceQueue[respNonce]
          this.log.info(`Subscribed to ${queueItem.topic}`)
          queueItem.resolve({
            error: null,
            message: `Successfully subscribed to ${queueItem.topic}`,
            action: 'subscribed'
          })
        } else if (queueItem.action === 'unsub') {
          this._removeTopicMapping(queueItem.topic)
          const topicIndex = this.subscribedTopics.indexOf(queueItem.topic)
          if (topicIndex > -1) {
            this.subscribedTopics.splice(topicIndex, 1)
          }
          delete this.topicHandlers[queueItem.topic]
          delete this.nonceQueue[respNonce]
          this.log.info(`Unsubscribed from ${queueItem.topic}`)
          queueItem.resolve({
            error: null,
            message: `Successfully unsubscribed from ${queueItem.topic}`,
            action: 'unsubscribed'
          })
        }
      }
    } else {
      this.log.warn('No item matching the response nonce found.')
    }
  }
  _handleMessage(message) {
    this.log.info('Handling incoming message')
    const msgTopic = message.data.topic
    if (msgTopic) {
      const msgHandler = this.topicHandlers[msgTopic]
      this.emit(msgTopic, message.data)
      msgHandler(message.data)
    } else {
      this.log.info(`Received messsage had no topic assigned, rejecting`)
    }
  }
  _storeTopicMapping(topic, handler, auth_token = null) {
    const topicExists = this.topicMappingData.findIndex((topicMap) => {
      return topicMap.topic === topic
    })
    if (topicExists == -1) {
      const topicMapping = {
        topic,
        handler,
        auth_token
      }
      this.topicMappingData.push(topicMapping)
      this.log.info(`Stored topic mapping for ${topic}`)
    }
  }
  _removeTopicMapping(topic) {
    const topicExists = this.topicMappingData.findIndex((topicMap) => {
      return topicMap.topic === topic
    })
    if (topicExists > -1) {
      this.topicMappingData.splice(topicExists,1)
      this.log.info(`Removed topic mapping for ${topic}`)
    }
  }
  _sendData(data, cb) {
    if (data.type != 'PING' && data.data && data.data.topics && data.data.topics.length) {
      this.log.info(`Sending ${data.type} message for ${data.data.topics[0]}`)
    }
    //TPS expects the data as string
    data = JSON.stringify(data)
    this.ws.send(data, cb)
  }
  _sendDataPromise(data, reject) {
    if (data.type != 'PING' && data.data && data.data.topics && data.data.topics.length) {
      this.log.info(`Sending ${data.type} message for ${data.data.topics[0]} with promise resolution`)
    }
    //TPS expects the data as string
    data = JSON.stringify(data)
    this.ws.send(data, (error) => {
      if (error) reject({error, message:null})
    })
  }
  _constructSubTemplate(topic, nonce, auth_token = null) {
    if (auth_token) {
      return this._constructSubTemplateWithAuth(topic, nonce, auth_token)
    }
    return {
      type: 'LISTEN',
      nonce: nonce,
      data: {
        topics: [topic]
      }
    }
  }
  _constructSubTemplateWithAuth(topic, nonce, auth_token) {
    return {
      type: 'LISTEN',
      nonce: nonce,
      data: {
        topics: [topic],
        auth_token
      }
    }
  }
  _constructUnsubTemplate(topic, nonce) {
    return {
      type: 'UNLISTEN',
      nonce: nonce,
      data: {
        topics: [topic]
      }
    }
  }
  //public API
  subscribe(topic, handler, auth_token = null) {
    const subTask = (taskTopic, handler, auth_token = null, resolve, reject) => {
      const taskNonce = nonce()
      //stringify nonce since TPS expect it as string not number
      const nonceString = '' + taskNonce
      const data = this._constructSubTemplate(taskTopic, nonceString, auth_token)
      this.nonceQueue[taskNonce] = {
        action: 'sub',
        topic: taskTopic,
        handler,
        auth_token,
        resolve,
        reject
      }
      this._sendDataPromise(data, reject)
    }
    const promise = new Promise((resolve, reject) => {
      const topicSubbed = this.subscribedTopics.findIndex((subbedTopic) => {
        return subbedTopic === topic
      })
      if (topicSubbed == -1) {
        if (this.subscribedTopics.length >= maxSubscriptions) {
          this.log.info('Subscribe failed, client already subscribed to maximum number of topics')
          reject({
            error: 'ERR_MAXSUB',
            message: `Unable to subscribe to more than ${maxSubscriptions} topic. Create a new client instance to subscribe to more topics.`
          })
        } else {
          if (handler && typeof handler === 'function') {
            if (this.ws.readyState > 1) {
              this._storeTopicMapping(topic, handler, auth_token)
              this.log.info('Subscribe failed, client is not connected. Will attempt to subscribe when connection is re-established')
              reject({
                error: 'ERR_DISCONNECTED',
                message: `Unable to subscribe from a disconnected client, topic added to subscription list and will be subscribed to on reconnect`
              })
            } else {
              subTask(topic, handler, auth_token, resolve, reject)
            }
          } else {
            this.log.info('Subscribe failed, handler function not provided')
            reject({
              error: 'ERR_NOHANDLER',
              message: `Subscribing to a topic requires a handler function`
            })
          }
        }
      } else {
        this.log.info('Subscribe failed, client was already subscribed to specified topic')
        reject({
          error: 'ERR_SUBEXISTS',
          message: `Client is already subscribed to topic: ${topic}`
        })
      }
    })
    return promise
  }
  unsubscribe(topic) {
    const unsubTask = (taskTopic, resolve, reject) => {
      const taskNonce = nonce()
      //stringify nonce since TPS expect it as string not number
      const nonceString = '' + taskNonce
      const data = this._constructUnsubTemplate(topic, nonceString)
      this.nonceQueue[taskNonce] = {
        action: 'unsub',
        topic: taskTopic,
        resolve,
        reject
      }
      this._sendDataPromise(data, reject)
    }
    const promise = new Promise((resolve, reject) => {
      if (this.subscribedTopics.length == 0) {
        this._removeTopicMapping(topic)
        delete this.topicHandlers[topic]
        this.log.info('Unsubscribe failed, client was not subscribed to any topic')
        reject({
          error: 'ERR_NOSUB',
          message: `Unable to unsubscrie from topic ${topic}. Reason: Client not subbed to any topics`
        })
      } else {
        const topicSubbed = this.subscribedTopics.findIndex((subbedTopic) => {
          return subbedTopic === topic
        })
        if (topicSubbed > -1) {
          if (this.ws.readyState > 1) {
            this.subscribedTopics.splice(topicSubbed, 1)
            this._removeTopicMapping(topic)
            delete this.topicHandlers[topic]
            this.log.info('Unsubscribe failed, client is not connected. Will attempt to unsubscribe when connection is re-established')
            reject({
              error: 'ERR_DISCONNECTED',
              message: `Unable to unsubscribe from a socket that is not connected to a server, topic removed the resub queue`
            })
          } else {
            unsubTask(topic, resolve, reject)
          }
        } else {
          this.log.info('Unsubscribe failed, client was not subscribed to specified topic')
          reject({
            error: 'ERR_NOSUB',
            message: `Client was not subscribed to topic: ${topic}`
          })
        }
      }
    })
    return promise
  }
  disconnect(force = false) {
    clearTimeout(this.pongTimeout)
    clearTimeout(this.pingTimer)
    this.shouldReconnect = false
    if (force) {
      this.ws.terminate()
    } else {
      this.ws.close()
    }
  }
}
module.exports.Client = Client
