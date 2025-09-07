// scripts/deploy-testnet.js
// Script to deploy and test the Real Estate POC on Algorand TestNet

const algosdk = require('algosdk');

// TestNet configuration
const algodClient = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '');

// TEAL Smart Contract Code
const approvalProgram = `
#pragma version 8

// Real Estate Escrow Contract - Simplified for POC
// Global State: seller, buyer, price, status, deadline

txn ApplicationID
int 0
==
bnz create_app

// Handle application calls
txn OnCompletion
int NoOp
==
bnz handle_noop

// Default reject
int 0
return

create_app:
    // Initialize global state
    byte "status"
    int 0  // 0 = active
    app_global_put
    
    byte "created"
    global LatestTimestamp
    app_global_put
    
    // Store initial parameters if provided
    txn NumAppArgs
    int 3
    >=
    bnz store_initial_params
    
    int 1
    return

store_initial_params:
    // Store seller
    byte "seller"
    txn Sender
    app_global_put
    
    // Store price
    byte "price"
    txn ApplicationArgs 0
    btoi
    app_global_put
    
    // Store property hash
    byte "prop_hash"
    txn ApplicationArgs 1
    app_global_put
    
    // Set deadline (30 days)
    byte "deadline"
    global LatestTimestamp
    int 2592000
    +
    app_global_put
    
    int 1
    return

handle_noop:
    // Check method
    txn ApplicationArgs 0
    byte "make_offer"
    ==
    bnz make_offer
    
    txn ApplicationArgs 0
    byte "confirm_transfer"
    ==
    bnz confirm_transfer
    
    txn ApplicationArgs 0
    byte "cancel_deal"
    ==
    bnz cancel_deal
    
    int 0
    return

make_offer:
    // Check if active
    byte "status"
    app_global_get
    int 0
    ==
    assert
    
    // Store buyer
    byte "buyer"
    txn Sender
    app_global_put
    
    // Update status to pending
    byte "status"
    int 1  // 1 = pending
    app_global_put
    
    int 1
    return

confirm_transfer:
    // Only seller can confirm
    txn Sender
    byte "seller"
    app_global_get
    ==
    assert
    
    // Check if pending
    byte "status"
    app_global_get
    int 1
    ==
    assert
    
    // Mark as completed
    byte "status"
    int 2  // 2 = completed
    app_global_put
    
    int 1
    return

cancel_deal:
    // Can be called by buyer, seller, or if deadline passed
    txn Sender
    byte "buyer"
    app_global_get
    ==
    
    txn Sender
    byte "seller"
    app_global_get
    ==
    ||
    
    global LatestTimestamp
    byte "deadline"
    app_global_get
    >
    ||
    assert
    
    // Mark as cancelled
    byte "status"
    int 0  // 0 = back to active (or could be 3 = cancelled)
    app_global_put
    
    int 1
    return
`;

const clearProgram = `
#pragma version 8
int 1
return
`;

// Helper functions
async function compileProgram(programSource) {
    try {
        const compileResponse = await algodClient.compile(programSource).do();
        return new Uint8Array(Buffer.from(compileResponse.result, 'base64'));
    } catch (error) {
        console.error('Error compiling program:', error);
        throw error;
    }
}

async function waitForConfirmation(txId) {
    try {
        const result = await algosdk.waitForConfirmation(algodClient, txId, 3);
        console.log(`✅ Transaction ${txId} confirmed in round ${result['confirmed-round']}`);
        return result;
    } catch (error) {
        console.error('Error waiting for confirmation:', error);
        throw error;
    }
}

// Generate test account
function generateTestAccount() {
    const account = algosdk.generateAccount();
    console.log(`🔑 Generated test account: ${account.addr}`);
    console.log(`📝 Mnemonic: ${algosdk.secretKeyToMnemonic(account.sk)}`);
    return account;
}

// Fund account from dispenser
async function fundAccount(address) {
    try {
        console.log(`💰 Funding account ${address} from TestNet dispenser...`);
        
        const response = await fetch(
            'https://dispenser.testnet.aws.algodev.network/dispense',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `account=${address}`
            }
        );

        if (response.ok) {
            console.log(`✅ Successfully funded account ${address}`);
            
            // Wait a moment for the transaction to be processed
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check balance
            const accountInfo = await algodClient.accountInformation(address).do();
            console.log(`💵 Account balance: ${accountInfo.amount / 1000000} ALGO`);
            
            return true;
        } else {
            console.log(`⚠️  Dispenser response: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.error('❌ Error funding account:', error);
        return false;
    }
}

// Deploy smart contract
async function deployContract(senderAccount, propertyPrice, propertyHash) {
    try {
        console.log('\n🚀 Deploying Real Estate Smart Contract...');
        
        const approvalProgram = await compileProgram(approvalProgram);
        const clearProgram = await compileProgram(clearProgram);
        const params = await algodClient.getTransactionParams().do();

        const appCreateTxn = algosdk.makeApplicationCreateTxn(
            senderAccount.addr,
            params,
            algosdk.OnApplicationComplete.NoOpOC,
            approvalProgram,
            clearProgram,
            16, // Global state schema: num ints
            16, // Global state schema: num bytes
            0,  // Local state schema: num ints
            0,  // Local state schema: num bytes
            [
                algosdk.encodeUint64(propertyPrice),
                new Uint8Array(Buffer.from(propertyHash)),
                new Uint8Array(Buffer.from('Real Estate POC'))
            ]
        );

        const signedTxn = appCreateTxn.signTxn(senderAccount.sk);
        const { txId } = await algodClient.sendRawTransaction(signedTxn).do();
        
        console.log(`📤 Submitted transaction: ${txId}`);
        
        const result = await waitForConfirmation(txId);
        const appId = result['application-index'];
        
        console.log(`✅ Smart Contract deployed successfully!`);
        console.log(`📋 Application ID: ${appId}`);
        console.log(`🔍 View on AlgoExplorer: https://testnet.algoexplorer.io/application/${appId}`);
        
        return appId;
    } catch (error) {
        console.error('❌ Error deploying contract:', error);
        throw error;
    }
}

// Make an offer on a property
async function makeOffer(buyerAccount, appId, offerAmount) {
    try {
        console.log(`\n💰 Making offer of ${offerAmount / 1000000} ALGO...`);
        
        const params = await algodClient.getTransactionParams().do();
        
        const appCallTxn = algosdk.makeApplicationNoOpTxn(
            buyerAccount.addr,
            params,
            appId,
            [new Uint8Array(Buffer.from('make_offer'))]
        );

        const signedTxn = appCallTxn.signTxn(buyerAccount.sk);
        const { txId } = await algodClient.sendRawTransaction(signedTxn).do();
        
        console.log(`📤 Submitted offer transaction: ${txId}`);
        await waitForConfirmation(txId);
        
        console.log(`✅ Offer submitted successfully!`);
        console.log(`🔍 View transaction: https://testnet.algoexplorer.io/tx/${txId}`);
        
        return txId;
    } catch (error) {
        console.error('❌ Error making offer:', error);
        throw error;
    }
}

// Get application state
async function getAppState(appId) {
    try {
        const appInfo = await algodClient.getApplicationByID(appId).do();
        const globalState = appInfo.params['global-state'] || [];
        
        console.log(`\n📊 Smart Contract State (App ID: ${appId}):`);
        console.log('=' .repeat(50));
        
        const state = {};
        
        for (const keyValue of globalState) {
            const key = Buffer.from(keyValue.key, 'base64').toString();
            let value;
            
            if (keyValue.value.type === 1) { // bytes
                if (key === 'seller' || key === 'buyer') {
                    try {
                        value = algosdk.encodeAddress(Buffer.from(keyValue.value.bytes, 'base64'));
                    } catch {
                        value = Buffer.from(keyValue.value.bytes, 'base64').toString();
                    }
                } else {
                    value = Buffer.from(keyValue.value.bytes, 'base64').toString();
                }
            } else { // uint
                value = keyValue.value.uint;
                if (key === 'price') {
                    value = `${value / 1000000} ALGO`;
                } else if (key === 'created' || key === 'deadline') {
                    value = `${value} (${new Date(value * 1000).toLocaleString()})`;
                } else if (key === 'status') {
                    const statuses = ['Active', 'Pending', 'Completed', 'Cancelled'];
                    value = `${value} (${statuses[value] || 'Unknown'})`;
                }
            }
            
            console.log(`${key.padEnd(12)}: ${value}`);
            state[key] = value;
        }
        
        console.log('=' .repeat(50));
        return state;
    } catch (error) {
        console.error('❌ Error getting app state:', error);
        throw error;
    }
}

// Main deployment and testing function
async function main() {
    try {
        console.log('🏠 Real Estate POC - TestNet Deployment Script');
        console.log('=' .repeat(60));
        
        // Generate test accounts
        console.log('\n👥 Setting up test accounts...');
        const sellerAccount = generateTestAccount();
        const buyerAccount = generateTestAccount();
        
        console.log(`📍 Seller: ${sellerAccount.addr}`);
        console.log(`📍 Buyer:  ${buyerAccount.addr}`);
        
        // Fund accounts
        console.log('\n💰 Funding accounts from TestNet dispenser...');
        await fundAccount(sellerAccount.addr);
        await fundAccount(buyerAccount.addr);
        
        // Deploy contract
        const propertyPrice = 500000000000; // 500,000 ALGO
        const propertyHash = 'property_doc_hash_' + Date.now();
        
        const appId = await deployContract(sellerAccount, propertyPrice, propertyHash);
        
        // Get initial state
        await getAppState(appId);
        
        // Buyer makes offer
        await makeOffer(buyerAccount, appId, propertyPrice);
        
        // Get state after offer
        await getAppState(appId);
        
        console.log('\n🎉 POC Deployment Complete!');
        console.log('=' .repeat(60));
        console.log(`✅ Smart Contract ID: ${appId}`);
        console.log(`🔍 AlgoExplorer: https://testnet.algoexplorer.io/application/${appId}`);
        console.log(`🌐 Use this App ID in your frontend to interact with the contract`);
        console.log('\n📝 Save these account mnemonics to test in your web app:');
        console.log(`Seller: ${algosdk.secretKeyToMnemonic(sellerAccount.sk)}`);
        console.log(`Buyer:  ${algosdk.secretKeyToMnemonic(buyerAccount.sk)}`);
        
    } catch (error) {
        console.error('\n❌ Deployment failed:', error);
        process.exit(1);
    }
}

// Command line usage
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    deployContract,
    makeOffer,
    getAppState,
    generateTestAccount,
    fundAccount
};