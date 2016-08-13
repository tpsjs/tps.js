let util = require('./utils')
const logLevels = {
  "trace": 0,
  "debug": 1,
  "info": 2,
  "warn": 3,
  "error": 4,
  "fatal": 5
}
class Logger {
  constructor(level) {
    if (level) {
      this.setLevel(level)
    } else {
      this.setLevel('error')
    }
  }
  setLevel(level) {
    this.currentLogLevel = level
  }
  log(level) {
    return (message) => {
      if (logLevels[level] >= logLevels[this.currentLogLevel]) {
        console.log(`[${util.formatDate(new Date())}] ${level}: ${message}`)
      }
    }
  }
  trace(message) {
    this.log("trace")(message)
  }
  debug(message) {
    this.log("debug")(message)
  }
  info(message) {
    this.log("info")(message)
  }
  warn(message) {
    this.log("warn")(message)
  }
  error(message) {
    this.log("error")(message)
  }
  fatal(message) {
    this.log("fatal")(message)
  }
}
module.exports = Logger
