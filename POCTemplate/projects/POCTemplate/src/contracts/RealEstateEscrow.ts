// contracts/RealEstateEscrow.ts

import algosdk, {
  Algodv2,
  OnApplicationComplete,
  makeApplicationCreateTxnFromObject,
  makeApplicationNoOpTxnFromObject,
  makePaymentTxnWithSuggestedParamsFromObject,
  waitForConfirmation,
} from "algosdk";
import { WalletAccount } from "../types/Property"; // <-- unified type

export class RealEstateEscrowContract {
  algod: Algodv2;

  constructor(algodClient: Algodv2) {
    this.algod = algodClient;
  }

  // ----------------- TEAL program -----------------
  getEscrowApprovalProgram(): string {
    return `
#pragma version 6
txn ApplicationID
int 0
==
bnz init

txna ApplicationArgs 0
byte "create_listing"
==
bnz create_listing

txna ApplicationArgs 0
byte "make_offer"
==
bnz make_offer

txna ApplicationArgs 0
byte "confirm_transfer"
==
bnz confirm_transfer

txna ApplicationArgs 0
byte "cancel_deal"
==
bnz cancel_deal

err

init:
int 1
return

create_listing:
txn Sender
app_global_put "seller"
txna ApplicationArgs 1
app_global_put "price"
txna ApplicationArgs 2
app_global_put "prop_hash"
txn FirstValidTime
app_global_put "created"
int 0
app_global_put "status"
int 1
return

make_offer:
txn Sender
app_global_put "buyer"
int 0
return

confirm_transfer:
txn Sender
app_global_get "seller"
==
assert
int 1
app_global_put "status"
int 1
return

cancel_deal:
txn Sender
app_global_get "buyer"
==
assert
int 2
app_global_put "status"
int 1
return
    `;
  }

  getClearProgram(): string {
    return `
#pragma version 6
int 1
    `;
  }

  async compileProgram(programSource: string): Promise<Uint8Array> {
    const result = await this.algod.compile(programSource).do();
    return new Uint8Array(Buffer.from(result.result, "base64"));
  }

  // ----------------- Deploy contract -----------------
  async deployContract(
    seller: WalletAccount,
    price: number,
    propHash: string
  ): Promise<number> {
    const approval = await this.compileProgram(this.getEscrowApprovalProgram());
    const clear = await this.compileProgram(this.getClearProgram());

    const params = await this.algod.getTransactionParams().do();

    const appCreateTxn = makeApplicationCreateTxnFromObject({
      from: seller.address,
      suggestedParams: params,
      approvalProgram: approval,
      clearProgram: clear,
      numLocalInts: 0,
      numLocalByteSlices: 0,
      numGlobalInts: 4,
      numGlobalByteSlices: 3,
      onComplete: OnApplicationComplete.NoOpOC,
      appArgs: [
        new Uint8Array(Buffer.from("create_listing")),
        algosdk.encodeUint64(price),
        new Uint8Array(Buffer.from(propHash)),
      ],
    });

    const signed = await seller.signer([appCreateTxn]);
    const { txId } = await this.algod.sendRawTransaction(signed).do();
    const result = await waitForConfirmation(this.algod, txId, 4);

    return result["application-index"];
  }

  // ----------------- Make offer -----------------
  async makeOffer(
    buyer: WalletAccount,
    appId: number,
    amount: number
  ): Promise<string> {
    const params = await this.algod.getTransactionParams().do();

    const payTxn = makePaymentTxnWithSuggestedParamsFromObject({
      from: buyer.address,
      to: algosdk.getApplicationAddress(appId),
      amount,
      suggestedParams: params,
    });

    const appCallTxn = makeApplicationNoOpTxnFromObject({
      from: buyer.address,
      appIndex: appId,
      suggestedParams: params,
      appArgs: [new Uint8Array(Buffer.from("make_offer"))],
    });

    algosdk.assignGroupID([payTxn, appCallTxn]);

    const signed = await buyer.signer([payTxn, appCallTxn]);
    const { txId } = await this.algod.sendRawTransaction(signed).do();
    await waitForConfirmation(this.algod, txId, 4);

    return txId;
  }

  // ----------------- Confirm transfer -----------------
  async confirmTransfer(caller: WalletAccount, appId: number): Promise<string> {
    const params = await this.algod.getTransactionParams().do();

    const appCallTxn = makeApplicationNoOpTxnFromObject({
      from: caller.address,
      appIndex: appId,
      suggestedParams: params,
      appArgs: [new Uint8Array(Buffer.from("confirm_transfer"))],
    });

    const signed = await caller.signer([appCallTxn]);
    const { txId } = await this.algod.sendRawTransaction(signed).do();
    await waitForConfirmation(this.algod, txId, 4);

    return txId;
  }

  // ----------------- Cancel deal -----------------
  async cancelDeal(caller: WalletAccount, appId: number): Promise<string> {
    const params = await this.algod.getTransactionParams().do();

    const appCallTxn = makeApplicationNoOpTxnFromObject({
      from: caller.address,
      appIndex: appId,
      suggestedParams: params,
      appArgs: [new Uint8Array(Buffer.from("cancel_deal"))],
    });

    const signed = await caller.signer([appCallTxn]);
    const { txId } = await this.algod.sendRawTransaction(signed).do();
    await waitForConfirmation(this.algod, txId, 4);

    return txId;
  }

  // ----------------- Read contract state -----------------
  async getContractState(appId: number): Promise<any> {
    const appInfo = await this.algod.getApplicationByID(appId).do();
    const globalState = appInfo.params["global-state"] || [];

    const state: Record<string, string> = {};
    for (const kv of globalState) {
      const key = Buffer.from(kv.key, "base64").toString();
      let value;
      if (kv.value.type === 1) {
        value = Buffer.from(kv.value.bytes, "base64").toString();
      } else {
        value = kv.value.uint;
      }
      state[key] = value;
    }

    return state;
  }
}
