const SHA256 = require("crypto-js/sha256")

class Block{

constructor(patientId,doctor,diagnosis,previousHash=""){

this.patientId = patientId
this.doctor = doctor
this.diagnosis = diagnosis
this.timestamp = Date.now()
this.previousHash = previousHash

this.hash = this.calculateHash()

}

calculateHash(){

return SHA256(
this.patientId +
this.doctor +
this.diagnosis +
this.timestamp +
this.previousHash
).toString()

}

}

module.exports = Block