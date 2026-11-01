function generateClientId(){

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

let id = "CC-"

for(let i=0;i<6;i++){
id += chars[Math.floor(Math.random()*chars.length)]
}

return id
}

module.exports = generateClientId