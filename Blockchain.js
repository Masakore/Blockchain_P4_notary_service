const SHA256 = require('crypto-js/sha256');
const level = require('level');
const chainDB = './chaindata';
const db = level(chainDB);
const Block = require('./Block.js');

//Method to fetch all data from LevelDB
function loadDataFromLevelDB () {
	return new Promise(function(resolve, reject){
		let dataArray = [];
		db.createReadStream()
		.on('data', function (data) {
			let modified = { key: parseInt(data.key), value: data.value }
		  dataArray.push(modified);
		})
		.on('error', function (err) {
		  reject(new Error(err));
		})
		.on('close', function () {
			let sortedArray = dataArray.sort(function (a, b){
				return a.key - b.key;
			});
		  resolve(sortedArray);
		});
	});
};

function addLevelDBData(key,value) {
  return new Promise(function(resolve, reject){
		db.put(key, value, function(err) {
	    if(err){
				reject('Block ' + key + ' submission failed' + err)
			}
			resolve(key)
	  });
	});
}

function getLevelDBData(key) {
	return new Promise(function(resolve, reject) {
		db.get(key, function(err, value) {
		  if(err)	{
				reject(err);
			}
			resolve(value);
		});
	});
}

/* ===== Blockchain Class ==========================
|  Class with a constructor for new blockchain 		|
|  ================================================*/

module.exports = class Blockchain{
  constructor(){
	  this.chain = [];
		loadDataFromLevelDB().then((data) => {
			if(data.length === 0){
	      this.addBlock(new Block("First block in the chain - Genesis block"));
			} else {
	      this.chain = data;
			}
		}).catch((error) => {
			console.error(error);
		});
  }

  // Add new block
  addBlock(newBlock){
		return new Promise((resolve, reject) => {
			loadDataFromLevelDB().then((data) => {
		    this.chain = data;
		    // Block height
		    newBlock.height = this.chain.length;
		    // UTC timestamp
		    newBlock.time = new Date().getTime().toString().slice(0,-3);
		    // previous block hash
		    if(this.chain.length>0){
					// Due to data structure, need to parse Block data here
					let blockInfo = JSON.parse(this.chain[this.chain.length-1].value);
		      newBlock.previousBlockHash = blockInfo.hash;
		    }
		    // Block hash with SHA256 using newBlock and converting to a string
		    newBlock.hash = SHA256(JSON.stringify(newBlock)).toString();

		    // Adding block object to chain
		  	this.chain.push(newBlock);

				addLevelDBData(this.chain.length - 1, JSON.stringify(newBlock)).then((data) => {
					resolve(data)
				}).catch((error) => {
					reject(error);
				});
			}).catch((error) => {
				console.error(error);
			});
		});
  }

  async getBlockHeight(){
		try {
		  let data = await loadDataFromLevelDB()
		  this.chain = data;
      return this.chain.length-1;
		} catch(err) {
			console.error(err);
		}
  }

  getBlock(blockHeight){
		return new Promise((resolve, reject) => {
			getLevelDBData(blockHeight).then((data) => {
				resolve(data);
			}).catch((err) => {
				reject(err);
			});
		});
  }

  validateBlock(blockHeight){
		return new Promise((resolve, reject) => {
	    this.getBlock(blockHeight).then((data) => {
	      // get block object
        let block = data
		    // get block hash
		    let blockHash = block.hash;
		    // remove block hash to test block integrity
		    block.hash = '';
		    // generate block hash
		    let validBlockHash = SHA256(JSON.stringify(block)).toString();
		    // Compare
		    if (blockHash===validBlockHash) {
	        return resolve(true);
		    } else {
	        console.log('Block #'+blockHeight+' invalid hash:\n'+blockHash+'<>'+validBlockHash);
	        return resolve(false);
		    }
			}).catch((error) => {
				reject(error);
			});
		});
  }

  async validateChain(){
    let errorLog = [];
    for (var i = 0; i < this.chain.length-1; i++) {
			let result = await this.validateBlock(i);

      if (!result) {
        errorLog.push(i);
			}

      let blockHash = this.chain[i].hash;
      let previousHash = this.chain[i+1].previousBlockHash;

      if (blockHash!==previousHash) {
        errorLog.push(i);
      }
    }

    if (errorLog.length>0) {
      console.log('Block errors = ' + errorLog.length);
      console.log('Blocks: '+errorLog);
    } else {
      console.log('No errors detected');
    }
  }
}
