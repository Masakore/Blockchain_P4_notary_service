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
  let currentTimeStamp = new Date().getTime()

  if (existingRequests.length > 0) {
    let existingRequestForTheAddress = extractExistingRequestByAddress(address)
    if (existingRequestForTheAddress !== null) {
      let previousTimeStamp = existingRequestForTheAddress['requestTimeStamp']
      let elapsed = (currentTimeStamp - previousTimeStamp) / 1000

      let remainingValidationWindow = existingRequestForTheAddress['validationWindow']
      let updatedValidationWindow = remainingValidationWindow - elapsed;

      if (updatedValidationWindow > 0) {
        existingRequestForTheAddress['validationWindow'] = updatedValidationWindow;
        existingRequests.push(existingRequestForTheAddress)

        return res.status(200).json(existingRequestForTheAddress)
      }
    }
  }

  let message = address + ":" + currentTimeStamp + ":" + "starRegistry"

  let new_validation_request = {
    address: address,
    requestTimeStamp: currentTimeStamp,
    message: message,
    validationWindow: DEFAULT_VALIDATION_WINDOW
  }
  existingRequests.push(new_validation_request)

  return res.status(200).json(new_validation_request)
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
  let signature = req.body.signature

  let existingRequestForTheAddress = getExistingRequestByAddress(address)
  if (existingRequestForTheAddress === null) {
    return res.status(422).json({ error: "Request not found"})
  }

  let currentTimeStamp = new Date().getTime()
  let previousTimeStamp = existingRequestForTheAddress['requestTimeStamp']
  let elapsed = (currentTimeStamp - previousTimeStamp) / 1000

  let remainingValidationWindow = existingRequestForTheAddress['validationWindow']
  let updatedValidationWindow = remainingValidationWindow - elapsed;

  if (updatedValidationWindow <= 0) {
    return res.status(422).json({ error: "Request expired"})
  }

  existingRequestForTheAddress['validationWindow'] = updatedValidationWindow;

  let message = existingRequestForTheAddress['message']
  let isMessageVerified = bitcoinMessage.verify(message, address, signature)

  let validation_request = {
    registerStar: true,
    status: {
      address: address,
      requestTimeStamp: previousTimeStamp,
      message: message,
      validationWindow: updatedValidationWindow,
      messageSignature: isMessageVerified? "valid" : "invalid"
    }
  }

  return res.status(200).json(validation_request)
})

function extractExistingRequestByAddress(address) {
  for (const [index, request] of existingRequests.entries()) {
    if (request['address'] === address) {
      existingRequests.splice(index, 1)
      return request
    }
  }
  return null
}

function getExistingRequestByAddress(address) {
  for (const [index, request] of existingRequests.entries()) {
    if (request['address'] === address) {
      return request
    }
  }
  return null
}

app.listen(port, () => console.log(`Private blockchain app listening on port ${port}!`))
