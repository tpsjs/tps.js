const hookStd = require('hook-std')
const tps = require("../index.js")
const logger = require("../lib/logger.js")

describe("Client()", function() {
  it("should default to the stock logger", function() {
    let client = new tps.Client()

    client.log.should.be.ok()
    client.disconnect()
  })

  it("should allow a custom logger", function() {
    let client = new tps.Client({
        logger: console
    })

    client.log.should.be.exactly(console)
    client.disconnect()
  })
})

describe("log()", function() {
  it("should log to the console", function() {
    let out = ''

    let unhook = hookStd.stdout({silent: true}, function(output) {
        out += output
    })

    const log = new logger()
    log.setLevel('info')
    log.info('foobar')

    unhook()

    let expected = out.trim()
    expected.should.containEql('info: foobar')
  })

  it("should set level via constructor", function() {
    let out = ''

    let unhook = hookStd.stdout({silent: true}, function(output) {
        out += output
    })

    const log = new logger('info')
    log.info('foobar')

    unhook()

    let expected = out.trim()
    expected.should.containEql('info: foobar')
  })

  it("should log all various levels", function() {
    let out = ''

    let unhook = hookStd.stdout({silent: true}, function(output) {
        out += output
    })

    const log = new logger('trace')

    log.trace('foobar')
    log.debug('foobar')
    log.info('foobar')
    log.warn('foobar')
    log.error('foobar')
    log.fatal('foobar')

    unhook()

    let expected = out.trim()
    expected.should.containEql('trace: foobar')
    expected.should.containEql('debug: foobar')
    expected.should.containEql('info: foobar')
    expected.should.containEql('warn: foobar')
    expected.should.containEql('error: foobar')
    expected.should.containEql('fatal: foobar')
  })

  it("should not log to the console if lower level", function() {
    let out = ''

    let unhook = hookStd.stdout({silent: true}, function(output) {
        out += output
    })

    const log = new logger()
    log.setLevel('error')
    log.info('foobar')

    unhook()

    let expected = out.trim()
    expected.should.containEql('')
  })
})
