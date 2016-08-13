const util = require("../lib/utils.js")

describe("util.formatDate()", function() {
  it("should format 8am", function() {
    util.formatDate(new Date('2015-01-01 8:00')).should.eql('08:00')
  })

  it("should format 8pm", function() {
    util.formatDate(new Date('2015-01-01 20:00')).should.eql('20:00')
  })

  it("should format 8.30pm", function() {
    util.formatDate(new Date('2015-01-01 20:30')).should.eql('20:30')
  })
})

describe("util.isNode()", function() {
  it("should return true", function() {
    util.isNode().should.be.true()
  })

  // it("should return false for browser", function() {
  //   // set up a browser environemtn
  //   util.isNode().should.be.false()
  // })
})
