const express = require('express')
const app = express()
const port = 8000
const Blockchain = require('./Blockchain.js')
const Block = require('./Block.js')
const bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

const blockChain = new Blockchain()

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

app.listen(port, () => console.log(`Private blockchain app listening on port ${port}!`))
