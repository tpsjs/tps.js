const hookStd = require('hook-std')

describe('Client()', function() {
    it('should return a new instance of itself', function() {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.should.be.an.instanceof(tps.Client)
      client.disconnect(true)
    })

    it("should use the 'info' log when debug is set", function() {
      const tps = require('../index.js')
      let client = new tps.Client({debug: true})
      client.should.be.ok()
      client.disconnect(true)
    })

    it('should allow a maximum of 50 topics', function() {
      const tps = require('../index.js')
      let topics = []
      for (let i = 0; i < 51; i++) {
        topics.push({
          topic: 'topicName'+i,
          handler: () => {}
        })
      }
      function testClient() {
        new tps.Client({topics})
      }
      testClient.should.throw(Error,{message: 'Maximum amount of topics a client can subscribe to is 49. Try splitting your topics across multiple clients'})
    })

    it('should allow a maximum of 10 instances', function() {
      const tps = require('../index.js')
      let instances = []
      let clients = []
      for (let i = 0; i < 11; i++) {
        instances.push(function testClient() {
          clients.push(new tps.Client())
        })
      }
      for (let i = 0; i < 11; i++) {
        if (i < 10) {
          instances[i].should.not.throw()
        } else {
          instances[i].should.throw()
        }
      }
      for (let client of clients) {
        client.disconnect(true)
      }
    })

    it('should emit connected event', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.disconnect(true)
        done()
      })
    })

    it('should subscribe to specified topics', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client({topics:[{topic: 'video-playback.lirik', handler: () => {
        client.disconnect(true)
        done()
      }}]})
      client.once('connected',() => {
        setTimeout(()=>{client._handleMessage({data:{topic:'video-playback.lirik',message:'test'}})},1000)
      })
    })

    it('should subscribe via public API', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.subscribe('video-playback.lirik',()=>{}).then(()=>{
          client.disconnect()
          done()
        })
      })
    })

    it('should unsubscribe via public API', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.subscribe('video-playback.lirik',()=>{}).then(()=>{
          client.unsubscribe('video-playback.lirik').then(()=>{
            client.disconnect()
            done()
          })
        })
      })
    })

    it('should handle messages sent to subscibed topics', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.subscribe('video-playback.lirik',()=>{
          client.disconnect()
          done()
        }).then(()=>{
          client._handleMessage({data:{topic:'video-playback.lirik',message:'test'}})
        })
      })
    })

    it('should fail to unsubscribe if the client was not subscribed to a topic', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.subscribe('video-playback.lirik',()=>{}).then(()=>{
          client.unsubscribe('video-playback.test').catch(()=>{
            client.disconnect()
            done()
          })
        })
      })
    })

    it('should fail to unsubscribe if the client was not subscribed to any topic', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.unsubscribe('video-playback.test').catch(()=>{
          client.disconnect()
          done()
        })
      })
    })

    it('should fail to subscribe if the client was already subscribed to the spcified topic', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.subscribe('video-playback.lirik',()=>{}).then(()=>{
          client.subscribe('video-playback.lirik',()=>{}).catch(()=>{
            client.disconnect()
            done()
          })
        })
      })
    })

    it('should fail to subscribe to an invalid topic', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.subscribe('video-playback231.lirik',()=>{}).catch(()=>{
          client.disconnect(true)
          done()
        })
      })
    })

    it('should fail to subscribe to authenticated endpoint with bad auth_token', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.subscribe('channel-bitsevents.23161357',()=>{},'abcd').catch(()=>{
          client.disconnect(true)
          done()
        })
      })
    })

    it('should fail to subscribe when no handler is provided', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.subscribe('video-playback.lirik').catch(()=>{
          client.disconnect(true)
          done()
        })
      })
    })

    it('should fail to subscribe when client subscribed to max number of topics', function(done) {
      const tps = require('../index.js')
      let topics = []
      let channels = ['hiimmikegaming','fmscanradio','chatlurking','avalonstar',
                      'theno1alex','snowlit','lirik','jacklifear','cohhcarnage',
                      'scrubing','summit1g','itmejp','wimpy','fire','squishy',
                      'omgelsie','fishstix','twitch','annemunition','kojaktsl',
                      'lachhhandfriends','happyhi','sgt_kal','kdraconis_','ezikiel_iii',
                      'bluejay','brotatoe','tehmorag','ikasper','djwheat','pipe',
                      'truthfull','duzen','dansgaming','witwix','stripedogbt',
                      'wyld','spencerawest','elspeth','netflix','doritos','leavetheweak',
                      'alcadesign','schmoopie','mosqiil','officialdaikon','broomsweeper',
                      'pixellumberjack','therealcmiller']
      for (let i = 0; i < 49; i++) {
        topics.push({
          topic: 'video-playback.'+channels[i],
          handler: () => {}
        })
      }
      let client = new tps.Client({topics})
      client.on('connected', function() {
        setTimeout(()=>{
          client.subscribe('video-playback.twitch_office',()=>{}).catch(()=>{
            client.disconnect(true)
            done()
          })
        },1000)
      })
    })

    it('should reject ws messages with malformed data', function(done) {
      let out = ''

      let unhook = hookStd.stdout({silent: true}, function(output) {
          out += output
      })

      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.ws.emit('message','hello',null)
        unhook()

        let expected = out.trim()
        expected.should.containEql('error: SyntaxError: Unexpected token')
        client.disconnect(true)
        done()
      })
    })

    it('should reconnect on RECONNECT ws message', function(done) {
      let out = ''

      let unhook = hookStd.stdout({silent: true}, function(output) {
          out += output
      })

      const tps = require('../index.js')
      let client = new tps.Client({debug:true})
      client.once('connected', function() {
        client.ws.emit('message',JSON.stringify({type:'RECONNECT'}),null)
        setTimeout(() =>{
          client.disconnect(true)
          unhook()

          let expected = out.trim()
          expected.should.containEql('info: Reconnecting!')
          done()
        },1000)
      })
    })

    it('should reject a message without a topic specified', function(done) {
      let out = ''

      let unhook = hookStd.stdout({silent: true}, function(output) {
          out += output
      })

      const tps = require('../index.js')
      let client = new tps.Client({debug:true})
      client.on('connected', function() {
        client.ws.emit('message',JSON.stringify({type:'MESSAGE',data:{test:true}}),null)
        setTimeout(() =>{
          client.disconnect(true)
          unhook()

          let expected = out.trim()
          console.log('ex',expected)
          expected.should.containEql('info: Received messsage had no topic assigned, rejecting')
          done()
        },1000)
      })
    })

    it('should limit the exponential backoff for reconnect to the specified max value', function(done) {
      let out = ''

      let unhook = hookStd.stdout({silent: true}, function(output) {
          out += output
      })

      const tps = require('../index.js')
      let client = new tps.Client({debug:true,exponentialBackoffMax:200})
      setTimeout(()=>{
        client._handleReconnect()
        client.on('connected', function() {
          client.disconnect(true)
          unhook()

          let expected = out.trim()
          expected.should.containEql('info: Reconnecting!')
          done()
        })
      },500)
    })

    it('should fail to subscribe when the socket is not connected', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.disconnect(true)
        setTimeout(()=>{
          client.subscribe('test',()=>{}).catch(()=>{done()})
        },500)
      })
    })

    it('should fail to unsubscribe when the socket is not connected', function(done) {
      const tps = require('../index.js')
      let client = new tps.Client()
      client.on('connected', function() {
        client.subscribe('video-playback.lirik',()=>{}).then(()=>{
          client.disconnect(true)
          setTimeout(()=>{
            client.unsubscribe('video-playback.lirik',()=>{}).catch(()=>{done()})
          },500)
        })
      })
    })

    it('should reject a response without a matching nonce', function(done) {
      let out = ''

      let unhook = hookStd.stdout({silent: true}, function(output) {
          out += output
      })

      const tps = require('../index.js')
      let client = new tps.Client({debug: true})
      client.on('connected', function() {
        client._handleResponse({type:'RESPONSE',error:'',nonce:'123456789'})
        setTimeout(() => {
          unhook()
          let expected = out.trim()
          expected.should.containEql('warn: No item matching the response nonce found.')
          client.disconnect(true)
          done()
        },500)
      })
    })

})
