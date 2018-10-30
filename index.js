// Server settings
const express = require('express')
const app = express()
const port = 8000

// HTTP Bodyparser setting
const bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// Blockchain utilities
const Blockchain = require('./Blockchain.js')
const Block = require('./Block.js')
const blockChain = new Blockchain()

// Use library to verify a wallet address(Blockchain ID) signature
const bitcoin = require('bitcoinjs-lib')
const bitcoinMessage = require('bitcoinjs-message')

var existingRequests = []
const DEFAULT_VALIDATION_WINDOW = 300


app.get('/block/:blockId', (req, res) => {
  let blockId = parseInt(req.params.blockId)
  if (isNaN(blockId)) {
    return res.status(422).json({ error: "Block Id must be numeric number"})
  }

  blockChain.getBlock(req.params.blockId).then((data) => {
    res.status(200).json(JSON.parse(data))
    // res.send(data)
  }).catch((err) => {
    return res.status(422).json({ error: "Block Id Not Found"})
  });
})

app.post('/block', (req, res) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(422).json({ error: "Please set http request body"})
  }

  if (!req.body.body) {
    return res.status(422).json({ error: "Please set data in http body"})
  }

  let block = new Block(req.body.body)
  blockChain.addBlock(block).then((data) => {
    blockChain.getBlock(data)
      .then((block) => {
          res.status(200).json(JSON.parse(block))
          // res.send(JSON.parse(block))
        }
      ).catch((err) => {
        return res.status(422).json({ error: err })
      })
    }
  ).catch((err) => {
    return res.status(422).json({ error: err })
  })
})

app.post('/requestValidation', (req, res) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(422).json({ error: "Please set http request body"})
  }

  if (!req.body.address) {
    return res.status(422).json({ error: "Please set Blockchain ID"})
  }

  let address = req.body.address
  let requestTimeStamp = new Date().getTime()

  if (existingRequests.length > 0) {
    let result = extractAddressFromExistingRequests(address)
    if (result !== null) {
      let currentTimeStamp = result['requestTimeStamp']
      let remainingTime = requestTimeStamp - currentTimeStamp

      if (0 < remainingTime && remainingTime <300000) {
        let updatedTimeStamp = currentTimeStamp - remainingTime
        result['requestTimeStamp'] = updatedTimeStamp

        return res.status(200).json(result)
      }
    }
  }

  let message = address + ":" + requestTimeStamp + ":" + "starRegistry"

  let validation_request = {
    "address": address,
    "requestTimeStamp": requestTimeStamp.toString(),
    "message": message,
    "validationWindow": DEFAULT_VALIDATION_WINDOW
  }
  existingRequests.push(validation_request)

  return res.status(200).json(validation_request)
})

app.post('/message-signature/validate', (req, res) => {
  if (Object.keys(req.body).length <= 1) {
    return res.status(422).json({ error: "Please set both Blockchain ID and its signature in http request body"})
  }

  if (!req.body.address) {
    return res.status(422).json({ error: "Please set Blockchain ID"})
  }

  if (!req.body.signature) {
    return res.status(422).json({ error: "Please set Blockchain ID signature"})
  }

  let address = req.body.address
  // Todo logic to get existing request from existingRequests variable
  let requestTimeStamp = []
  let message = address + ":" + requestTimeStamp + ":" + "starRegistry"
  let remaingingValidationWindow = 300
  let isMessageVerified = bitcoinMessage.verify(message, message, signature)

  let validation_request = {
    "registerStar": remaingingValidationWindow > 0? true : false,
    "status": {
      "address": address,
      "requestTimeStamp": requestTimeStamp.toString(),
      "message": message,
      "validationWindow": DEFAULT_VALIDATION_WINDOW,
      "messageSignature": isMessageVerified? "valid" : "invalid"
    }
  }

})

function extractAddressFromExistingRequests(address) {
  for (let json in existingRequests) {
    if (json['address'] === address) {
      existingRequests.splice(i, 1)
      return json
    }
    return null
  }
}

app.listen(port, () => console.log(`Private blockchain app listening on port ${port}!`))
