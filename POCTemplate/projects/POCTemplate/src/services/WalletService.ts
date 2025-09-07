// services/WalletService.ts
// Enhanced wallet connection service with Pera Wallet integration

import algosdk from 'algosdk';

declare global {
  interface Window {
    AlgoSigner: any;
  }
}

export interface WalletAccount {
  address: string;
  name?: string;
}

export class WalletService {
  private peraWallet: any = null;
  private algodClient: algosdk.Algodv2;
  
  constructor() {
    // Initialize Algorand client for TestNet
    this.algodClient = new algosdk.Algodv2(
      '',
      'https://testnet-api.algonode.cloud',
      ''
    );
    
    this.initializePeraWallet();
  }

  private async initializePeraWallet() {
    try {
      // Dynamic import for Pera Wallet
      const { PeraWalletConnect } = await import('@perawallet/connect');
      this.peraWallet = new PeraWalletConnect();
      
      // Reconnect to previous session if exists
      this.peraWallet.reconnectSession().then((accounts: string[]) => {
        if (accounts.length > 0) {
          console.log('Reconnected to Pera Wallet');
        }
      }).catch((e: any) => {
        console.log('No previous Pera Wallet session');
      });
    } catch (error) {
      console.warn('Pera Wallet not available:', error);
    }
  }

  // Connect to Pera Wallet
  async connectPeraWallet(): Promise<WalletAccount[]> {
    if (!this.peraWallet) {
      throw new Error('Pera Wallet not initialized');
    }

    try {
      const accounts = await this.peraWallet.connect();
      return accounts.map((address: string) => ({
        address,
        name: `Pera ${address.slice(0, 8)}...${address.slice(-4)}`
      }));
    } catch (error) {
      console.error('Error connecting to Pera Wallet:', error);
      throw error;
    }
  }

  // Connect to AlgoSigner
  async connectAlgoSigner(): Promise<WalletAccount[]> {
    if (typeof window.AlgoSigner === 'undefined') {
      throw new Error('AlgoSigner not installed');
    }

    try {
      await window.AlgoSigner.connect();
      const accounts = await window.AlgoSigner.accounts({
        ledger: 'TestNet'
      });
      
      return accounts.map((account: any) => ({
        address: account.address,
        name: `AlgoSigner ${account.address.slice(0, 8)}...${account.address.slice(-4)}`
      }));
    } catch (error) {
      console.error('Error connecting to AlgoSigner:', error);
      throw error;
    }
  }

  // Disconnect wallet
  async disconnect(): Promise<void> {
    if (this.peraWallet) {
      await this.peraWallet.disconnect();
    }
    // AlgoSigner doesn't have a disconnect method
  }

  // Get account balance
  async getBalance(address: string): Promise<number> {
    try {
      const accountInfo = await this.algodClient.accountInformation(address).do();
      return accountInfo.amount; // Returns balance in microALGOs
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  }

  // Sign transaction with Pera Wallet
  async signTransactionPera(transaction: algosdk.Transaction): Promise<Uint8Array> {
    if (!this.peraWallet) {
      throw new Error('Pera Wallet not connected');
    }

    try {
      const signedTxns = await this.peraWallet.signTransaction([
        [{ txn: transaction, signers: [transaction.from.toString()] }]
      ]);
      return signedTxns[0];
    } catch (error) {
      console.error('Error signing transaction with Pera:', error);
      throw error;
    }
  }

  // Sign transaction with AlgoSigner
  async signTransactionAlgoSigner(transaction: algosdk.Transaction): Promise<Uint8Array> {
    if (!window.AlgoSigner) {
      throw new Error('AlgoSigner not available');
    }

    try {
      const txnB64 = window.AlgoSigner.encoding.msgpackToBase64(transaction.toByte());
      const signedTxns = await window.AlgoSigner.signTxn([{
        txn: txnB64
      }]);
      
      return window.AlgoSigner.encoding.base64ToMsgpack(signedTxns[0].blob);
    } catch (error) {
      console.error('Error signing transaction with AlgoSigner:', error);
      throw error;
    }
  }

  // Sign multiple transactions for group transactions
  async signTransactionGroup(
    transactions: algosdk.Transaction[],
    walletType: 'pera' | 'algosigner'
  ): Promise<Uint8Array[]> {
    if (walletType === 'pera' && this.peraWallet) {
      try {
        const txnsToSign = transactions.map(txn => ({
          txn: txn,
          signers: [txn.from.toString()]
        }));
        
        const signedTxns = await this.peraWallet.signTransaction([txnsToSign]);
        return signedTxns;
      } catch (error) {
        console.error('Error signing group transaction with Pera:', error);
        throw error;
      }
    } else if (walletType === 'algosigner' && window.AlgoSigner) {
      try {
        const txnsToSign = transactions.map(txn => ({
          txn: window.AlgoSigner.encoding.msgpackToBase64(txn.toByte())
        }));
        
        const signedTxns = await window.AlgoSigner.signTxn(txnsToSign);
        return signedTxns.map((signedTxn: any) => 
          window.AlgoSigner.encoding.base64ToMsgpack(signedTxn.blob)
        );
      } catch (error) {
        console.error('Error signing group transaction with AlgoSigner:', error);
        throw error;
      }
    }
    
    throw new Error(`Unsupported wallet type: ${walletType}`);
  }

  // Send signed transaction
  async sendTransaction(signedTransaction: Uint8Array): Promise<string> {
    try {
      const { txId } = await this.algodClient.sendRawTransaction(signedTransaction).do();
      await algosdk.waitForConfirmation(this.algodClient, txId, 3);
      return txId;
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  }

  // Send multiple signed transactions
  async sendTransactionGroup(signedTransactions: Uint8Array[]): Promise<string> {
    try {
      const { txId } = await this.algodClient.sendRawTransactions(signedTransactions).do();
      await algosdk.waitForConfirmation(this.algodClient, txId, 3);
      return txId;
    } catch (error) {
      console.error('Error sending transaction group:', error);
      throw error;
    }
  }

  // Get Algorand client
  getAlgodClient(): algosdk.Algodv2 {
    return this.algodClient;
  }

  // Format address for display
  formatAddress(address: string): string {
    return `${address.slice(0, 8)}...${address.slice(-4)}`;
  }

  // Format ALGO amount
  formatAlgoAmount(microAlgos: number): string {
    return (microAlgos / 1000000).toFixed(2);
  }

  // Check if address is valid
  isValidAddress(address: string): boolean {
    try {
      algosdk.decodeAddress(address);
      return true;
    } catch {
      return false;
    }
  }

  // Get transaction parameters
  async getTransactionParams(): Promise<algosdk.SuggestedParams> {
    return await this.algodClient.getTransactionParams().do();
  }

  // Create payment transaction
  async createPaymentTransaction(
    from: string,
    to: string,
    amount: number,
    note?: string
  ): Promise<algosdk.Transaction> {
    const params = await this.getTransactionParams();
    
    return algosdk.makePaymentTxn(
      from,
      to,
      amount,
      undefined,
      note ? new Uint8Array(Buffer.from(note)) : undefined,
      params
    );
  }

  // Wait for transaction confirmation
  async waitForConfirmation(txId: string, maxRounds: number = 3): Promise<any> {
    return await algosdk.waitForConfirmation(this.algodClient, txId, maxRounds);
  }

  // Get transaction by ID
  async getTransaction(txId: string): Promise<any> {
    try {
      return await this.algodClient.pendingTransactionInformation(txId).do();
    } catch (error) {
      console.error('Error getting transaction:', error);
      throw error;
    }
  }

  // Fund account from TestNet dispenser (for testing)
  async fundFromDispenser(address: string): Promise<void> {
    try {
      const response = await fetch('https://testnet-api.algonode.cloud/v2/accounts/' + address);
      if (!response.ok) {
        // Account doesn't exist, fund it
        const fundResponse = await fetch(
          `https://dispenser.testnet.aws.algodev.network/dispense`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `account=${address}`
          }
        );
        
        if (!fundResponse.ok) {
          throw new Error('Failed to fund account from dispenser');
        }
      }
    } catch (error) {
      console.warn('Could not fund from dispenser:', error);
      // Don't throw error as this is just a convenience function
    }
  }
}