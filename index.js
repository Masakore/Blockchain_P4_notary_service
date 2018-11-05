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
var validatedRequests = []
const DEFAULT_VALIDATION_WINDOW = 300


app.get('/stars/address/:address', (req, res) => {
  blockChain.getBlockWithAddress(req.params.address).then((data) => {
    res.status(200).json(data)
  }).catch((err) => {
    return res.status(422).json({ error: "Block Not Found with the address"})
  });
})

app.get('/stars/hash/:hash', (req, res) => {
  blockChain.getBlockWithHash(req.params.hash).then((data) => {
    res.status(200).json(data)
  }).catch((err) => {
    return res.status(422).json({ error: "Block Not Found with the hash"})
  });
})

app.get('/block/:height', (req, res) => {
  let blockId = parseInt(req.params.height)
  if (isNaN(blockId)) {
    return res.status(422).json({ error: "Block height must be numeric number"})
  }

  blockChain.getBlock(req.params.height).then((data) => {
    res.status(200).json(data)
  }).catch((err) => {
    return res.status(422).json({ error: "Block Not Found with the height"})
  });
})

app.post('/block', (req, res) => {
  if (Object.keys(req.body).length < 2) {
    return res.status(422).json({ error: "Please set address and start data in http request body"})
  }

  if (!req.body.address) {
    return res.status(422).json({ error: "Please set address in http body"})
  }

  if (!req.body.star) {
    return res.status(422).json({ error: "Please set star data in http body"})
  }

  if (!req.body.star.dec || !req.body.star.ra || !req.body.star.story) {
    return res.status(422).json({ error: "Please set right ascension, declination, story in http body"})
  }

  if (req.body.star.story.length > 250) {
    return res.status(422).json({ error: "Story is required to be 250 words or less"})
  }

  if (validatedRequests.length === 0 || getValidatedRequestByAddress(req.body.address) === null) {
    return res.status(422).json({ error: "Your request must be validated by calling '/message-signature/validate API!'"})
  }

  let block = new Block(req.body)
  blockChain.addBlock(block).then((data) => {
    blockChain.getBlock(data)
      .then((result) => {
        extractExistingRequestByAddress(req.body.address)
        extractValidatedRequestByAddress(req.body.address)

        res.status(200).json(result)
      }).catch((err) => {
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

  if (isMessageVerified === false) {
    return res.status(422).json({ error: "Wrong signature"})
  }

  let validation_request = {
    registerStar: true,
    status: {
      address: address,
      requestTimeStamp: previousTimeStamp,
      message: message,
      validationWindow: updatedValidationWindow,
      messageSignature: "valid"
    }
  }

  validatedRequests.push(validation_request)

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

function getValidatedRequestByAddress(address) {
  for (const [index, request] of validatedRequests.entries()) {
    if (request.status.address === address) {
      return request
    }
  }
  return null
}

function extractValidatedRequestByAddress(address) {
  for (const [index, request] of validatedRequests.entries()) {
    if (request.status.address === address) {
      validatedRequests.splice(index, 1)
      return request
    }
  }
  return null
}

app.listen(port, () => console.log(`Private blockchain app listening on port ${port}!`))
