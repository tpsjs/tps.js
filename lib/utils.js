module.exports = {
  formatDate: (date) => {
    let hours = date.getHours()
    let minutes = date.getMinutes()
    hours = (hours < 10 ? '0' : '') + hours
    minutes = (minutes < 10 ? '0' : '') + minutes
    return `${hours}:${minutes}`
  },
  isNode: () => {
    try {
      if (module.exports = "object" === typeof process &&
          Object.prototype.toString.call(process) === "[object process]") {
        return true
      }
      return false
    } catch(e) {
      return false
    }
  }
}
