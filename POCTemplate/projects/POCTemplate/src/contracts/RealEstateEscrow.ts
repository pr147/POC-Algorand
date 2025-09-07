// contracts/RealEstateEscrow.ts
// Real Estate Escrow Smart Contract for Algorand

import algosdk from 'algosdk';

export class RealEstateEscrowContract {
  private algodClient: algosdk.Algodv2;
  
  constructor(algodClient: algosdk.Algodv2) {
    this.algodClient = algodClient;
  }

  // TEAL code for the escrow smart contract
  getEscrowApprovalProgram(): string {
    return `
#pragma version 8

// Real Estate Escrow Contract
// Global State Schema: 16 ints, 16 bytes
// Local State Schema: 0 ints, 0 bytes

// Global State Keys:
// "seller" - seller address
// "buyer" - buyer address  
// "price" - property price in microALGOs
// "prop_hash" - hash of property documents
// "deadline" - transaction deadline timestamp
// "status" - 0: active, 1: completed, 2: cancelled
// "created" - creation timestamp

txn ApplicationID
int 0
==
bnz create_app

// Handle application calls
txn OnCompletion
int NoOp
==
bnz handle_noop

txn OnCompletion
int DeleteApplication
==
bnz handle_delete

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
    
    int 1
    return

handle_delete:
    // Only creator can delete
    txn Sender
    global CreatorAddress
    ==
    return

handle_noop:
    // Check method being called
    txn ApplicationArgs 0
    byte "create_listing"
    ==
    bnz create_listing
    
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
    
    // Default reject
    int 0
    return

create_listing:
    // Only called by seller during creation
    global GroupSize
    int 1
    ==
    assert
    
    // Store seller info
    byte "seller"
    txn Sender
    app_global_put
    
    // Store property price from argument
    byte "price"
    txn ApplicationArgs 1
    btoi
    app_global_put
    
    // Store property document hash
    byte "prop_hash"
    txn ApplicationArgs 2
    app_global_put
    
    // Set deadline (30 days from now)
    byte "deadline"
    global LatestTimestamp
    int 2592000  // 30 days in seconds
    +
    app_global_put
    
    int 1
    return

make_offer:
    // Check contract is still active
    byte "status"
    app_global_get
    int 0
    ==
    assert
    
    // Check deadline hasn't passed
    global LatestTimestamp
    byte "deadline"
    app_global_get
    <
    assert
    
    // This should be part of a group transaction with payment
    global GroupSize
    int 2
    ==
    assert
    
    // First transaction should be the payment
    gtxn 0 TypeEnum
    int pay
    ==
    assert
    
    // Payment should be to this contract
    gtxn 0 Receiver
    global CurrentApplicationAddress
    ==
    assert
    
    // Payment amount should match property price
    gtxn 0 Amount
    byte "price"
    app_global_get
    ==
    assert
    
    // Store buyer address
    byte "buyer"
    txn Sender
    app_global_put
    
    int 1
    return

confirm_transfer:
    // Only seller can confirm transfer
    txn Sender
    byte "seller"
    app_global_get
    ==
    assert
    
    // Check contract is still active
    byte "status"
    app_global_get
    int 0
    ==
    assert
    
    // Check deadline hasn't passed
    global LatestTimestamp
    byte "deadline"
    app_global_get
    <
    assert
    
    // This should be part of a group transaction with payment to seller
    global GroupSize
    int 2
    ==
    assert
    
    // Payment should be from contract to seller
    gtxn 0 TypeEnum
    int pay
    ==
    assert
    
    gtxn 0 Sender
    global CurrentApplicationAddress
    ==
    assert
    
    gtxn 0 Receiver
    byte "seller"
    app_global_get
    ==
    assert
    
    // Mark as completed
    byte "status"
    int 1  // 1 = completed
    app_global_put
    
    int 1
    return

cancel_deal:
    // Can be called by buyer or seller, or automatically after deadline
    
    // Check if deadline has passed (automatic cancellation)
    global LatestTimestamp
    byte "deadline"
    app_global_get
    >
    
    // OR check if called by buyer or seller
    txn Sender
    byte "buyer"
    app_global_get
    ==
    
    txn Sender
    byte "seller"
    app_global_get
    ==
    
    ||
    ||
    assert
    
    // Check contract is still active
    byte "status"
    app_global_get
    int 0
    ==
    assert
    
    // This should be part of a group transaction with refund to buyer
    global GroupSize
    int 2
    ==
    assert
    
    // Payment should be from contract to buyer
    gtxn 0 TypeEnum
    int pay
    ==
    assert
    
    gtxn 0 Sender
    global CurrentApplicationAddress
    ==
    assert
    
    gtxn 0 Receiver
    byte "buyer"
    app_global_get
    ==
    assert
    
    // Mark as cancelled
    byte "status"
    int 2  // 2 = cancelled
    app_global_put
    
    int 1
    return
`;
  }

  getClearProgram(): string {
    return `
#pragma version 8
int 1
return
`;
  }

  // Compile TEAL programs
  async compileProgram(programSource: string): Promise<Uint8Array> {
    const compileResponse = await this.algodClient.compile(programSource).do();
    return new Uint8Array(Buffer.from(compileResponse.result, 'base64'));
  }

  // Deploy the smart contract
  async deployContract(
    senderAccount: algosdk.Account,
    propertyPrice: number,
    propertyDocumentHash: string
  ): Promise<number> {
    const approvalProgram = await this.compileProgram(this.getEscrowApprovalProgram());
    const clearProgram = await this.compileProgram(this.getClearProgram());

    const params = await this.algodClient.getTransactionParams().do();

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
        new Uint8Array(Buffer.from('create_listing')),
        algosdk.encodeUint64(propertyPrice),
        new Uint8Array(Buffer.from(propertyDocumentHash))
      ]
    );

    const signedTxn = appCreateTxn.signTxn(senderAccount.sk);
    const { txId } = await this.algodClient.sendRawTransaction(signedTxn).do();
    
    const result = await algosdk.waitForConfirmation(this.algodClient, txId, 3);
    return result['application-index'];
  }

  // Make an offer (buyer deposits funds)
  async makeOffer(
    buyerAccount: algosdk.Account,
    appId: number,
    offerAmount: number
  ): Promise<string> {
    const params = await this.algodClient.getTransactionParams().do();
    
    // Get application address
    const appAddress = algosdk.getApplicationAddress(appId);

    // Create payment transaction
    const payTxn = algosdk.makePaymentTxn(
      buyerAccount.addr,
      appAddress,
      offerAmount,
      undefined,
      undefined,
      params
    );

    // Create application call transaction
    const appCallTxn = algosdk.makeApplicationNoOpTxn(
      buyerAccount.addr,
      params,
      appId,
      [new Uint8Array(Buffer.from('make_offer'))]
    );

    // Group transactions
    const groupTxns = [payTxn, appCallTxn];
    algosdk.assignGroupID(groupTxns);

    // Sign transactions
    const signedPayTxn = payTxn.signTxn(buyerAccount.sk);
    const signedAppCallTxn = appCallTxn.signTxn(buyerAccount.sk);

    // Submit group transaction
    const { txId } = await this.algodClient.sendRawTransactions([signedPayTxn, signedAppCallTxn]).do();
    
    await algosdk.waitForConfirmation(this.algodClient, txId, 3);
    return txId;
  }

  // Confirm transfer (seller releases funds)
  async confirmTransfer(
    sellerAccount: algosdk.Account,
    appId: number
  ): Promise<string> {
    const params = await this.algodClient.getTransactionParams().do();
    
    // Get application state to find price and buyer
    const appInfo = await this.algodClient.getApplicationByID(appId).do();
    const globalState = appInfo.params['global-state'];
    
    let price = 0;
    let buyerAddr = '';
    
    for (const state of globalState) {
      const key = Buffer.from(state.key, 'base64').toString();
      if (key === 'price') {
        price = state.value.uint;
      }
      if (key === 'buyer') {
        buyerAddr = algosdk.encodeAddress(Buffer.from(state.value.bytes, 'base64'));
      }
    }

    // Create payment transaction from app to seller
    const appAddress = algosdk.getApplicationAddress(appId);
    const payTxn = algosdk.makePaymentTxn(
      appAddress,
      sellerAccount.addr,
      price - 1000, // Minus min balance for app account
      undefined,
      undefined,
      params
    );

    // Create application call transaction
    const appCallTxn = algosdk.makeApplicationNoOpTxn(
      sellerAccount.addr,
      params,
      appId,
      [new Uint8Array(Buffer.from('confirm_transfer'))]
    );

    // Group transactions
    const groupTxns = [payTxn, appCallTxn];
    algosdk.assignGroupID(groupTxns);

    // Sign transactions (app address signs payment via logic sig)
    const signedAppCallTxn = appCallTxn.signTxn(sellerAccount.sk);

    // For the payment from app, we need to create a logic signature
    const program = await this.compileProgram(this.getEscrowApprovalProgram());
    const logicSig = new algosdk.LogicSigAccount(program, []);
    const signedPayTxn = algosdk.signLogicSigTransaction(payTxn, logicSig);

    // Submit group transaction
    const { txId } = await this.algodClient.sendRawTransactions([signedPayTxn.blob, signedAppCallTxn]).do();
    
    await algosdk.waitForConfirmation(this.algodClient, txId, 3);
    return txId;
  }

  // Cancel deal and refund buyer
  async cancelDeal(
    account: algosdk.Account,
    appId: number
  ): Promise<string> {
    const params = await this.algodClient.getTransactionParams().do();
    
    // Get application state to find price and buyer
    const appInfo = await this.algodClient.getApplicationByID(appId).do();
    const globalState = appInfo.params['global-state'];
    
    let price = 0;
    let buyerAddr = '';
    
    for (const state of globalState) {
      const key = Buffer.from(state.key, 'base64').toString();
      if (key === 'price') {
        price = state.value.uint;
      }
      if (key === 'buyer') {
        buyerAddr = algosdk.encodeAddress(Buffer.from(state.value.bytes, 'base64'));
      }
    }

    // Create payment transaction from app to buyer
    const appAddress = algosdk.getApplicationAddress(appId);
    const payTxn = algosdk.makePaymentTxn(
      appAddress,
      buyerAddr,
      price - 1000, // Minus min balance
      undefined,
      undefined,
      params
    );

    // Create application call transaction
    const appCallTxn = algosdk.makeApplicationNoOpTxn(
      account.addr,
      params,
      appId,
      [new Uint8Array(Buffer.from('cancel_deal'))]
    );

    // Group transactions
    const groupTxns = [payTxn, appCallTxn];
    algosdk.assignGroupID(groupTxns);

    // Sign transactions
    const signedAppCallTxn = appCallTxn.signTxn(account.sk);
    
    const program = await this.compileProgram(this.getEscrowApprovalProgram());
    const logicSig = new algosdk.LogicSigAccount(program, []);
    const signedPayTxn = algosdk.signLogicSigTransaction(payTxn, logicSig);

    // Submit group transaction
    const { txId } = await this.algodClient.sendRawTransactions([signedPayTxn.blob, signedAppCallTxn]).do();
    
    await algosdk.waitForConfirmation(this.algodClient, txId, 3);
    return txId;
  }

  // Get contract state
  async getContractState(appId: number): Promise<any> {
    const appInfo = await this.algodClient.getApplicationByID(appId).do();
    const globalState = appInfo.params['global-state'];
    
    const state: any = {};
    
    for (const keyValue of globalState) {
      const key = Buffer.from(keyValue.key, 'base64').toString();
      
      if (keyValue.value.type === 1) { // bytes
        if (key === 'seller' || key === 'buyer') {
          state[key] = algosdk.encodeAddress(Buffer.from(keyValue.value.bytes, 'base64'));
        } else {
          state[key] = Buffer.from(keyValue.value.bytes, 'base64').toString();
        }
      } else { // uint
        state[key] = keyValue.value.uint;
      }
    }
    
    return state;
  }
}