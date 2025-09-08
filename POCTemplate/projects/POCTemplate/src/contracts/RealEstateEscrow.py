from pyteal import *

def real_estate_escrow():
    """
    Real Estate Escrow Smart Contract for RealChain
    
    This contract handles secure property transactions with:
    - Buyer deposits ALGO into escrow
    - Seller confirms property transfer
    - Automatic refund if seller doesn't confirm within timeout
    - Property document hash verification
    """
    
    # Global state keys
    buyer_key = Bytes("buyer")
    seller_key = Bytes("seller")
    property_hash_key = Bytes("property_hash")
    deposit_amount_key = Bytes("deposit_amount")
    timeout_key = Bytes("timeout")
    deal_status_key = Bytes("status")  # 0=active, 1=completed, 2=refunded
    
    # Application call methods
    on_creation = Seq([
        # Initialize contract with seller, property hash, and timeout period
        App.globalPut(seller_key, Txn.application_args[0]),
        App.globalPut(property_hash_key, Txn.application_args[1]),
        App.globalPut(timeout_key, Global.latest_timestamp() + Btoi(Txn.application_args[2])),
        App.globalPut(deal_status_key, Int(0)),  # Active
        App.globalPut(deposit_amount_key, Int(0)),
        Approve()
    ])
    
    # Buyer deposits ALGO into escrow
    on_deposit = Seq([
        # Verify this is a payment transaction
        Assert(Gtxn[0].type_enum() == TxnType.Payment),
        Assert(Gtxn[0].receiver() == Global.current_application_address()),
        Assert(Gtxn[0].amount() > Int(0)),
        
        # Verify deal is still active
        Assert(App.globalGet(deal_status_key) == Int(0)),
        
        # Verify timeout hasn't been reached
        Assert(Global.latest_timestamp() < App.globalGet(timeout_key)),
        
        # Store buyer and deposit amount
        App.globalPut(buyer_key, Gtxn[0].sender()),
        App.globalPut(deposit_amount_key, Gtxn[0].amount()),
        
        Approve()
    ])
    
    # Seller confirms property transfer and releases funds
    on_confirm_transfer = Seq([
        # Verify sender is the seller
        Assert(Txn.sender() == App.globalGet(seller_key)),
        
        # Verify deal is active and has deposit
        Assert(App.globalGet(deal_status_key) == Int(0)),
        Assert(App.globalGet(deposit_amount_key) > Int(0)),
        
        # Optional: Verify property document hash if provided
        If(
            Txn.application_args.length() > Int(0),
            Assert(Txn.application_args[0] == App.globalGet(property_hash_key))
        ),
        
        # Transfer funds to seller
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields({
            TxnField.type_enum: TxnType.Payment,
            TxnField.receiver: App.globalGet(seller_key),
            TxnField.amount: App.globalGet(deposit_amount_key) - Global.min_txn_fee(),
        }),
        InnerTxnBuilder.Submit(),
        
        # Mark deal as completed
        App.globalPut(deal_status_key, Int(1)),
        
        Approve()
    ])
    
    # Refund buyer if timeout is reached or seller cancels
    on_refund = Seq([
        # Allow refund if:
        # 1. Timeout has been reached, OR
        # 2. Seller initiates cancellation, OR
        # 3. Buyer requests refund after timeout
        Assert(
            Or(
                Global.latest_timestamp() >= App.globalGet(timeout_key),
                Txn.sender() == App.globalGet(seller_key),
                And(
                    Txn.sender() == App.globalGet(buyer_key),
                    Global.latest_timestamp() >= App.globalGet(timeout_key)
                )
            )
        ),
        
        # Verify deal is active and has deposit
        Assert(App.globalGet(deal_status_key) == Int(0)),
        Assert(App.globalGet(deposit_amount_key) > Int(0)),
        
        # Refund to buyer
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields({
            TxnField.type_enum: TxnType.Payment,
            TxnField.receiver: App.globalGet(buyer_key),
            TxnField.amount: App.globalGet(deposit_amount_key) - Global.min_txn_fee(),
        }),
        InnerTxnBuilder.Submit(),
        
        # Mark deal as refunded
        App.globalPut(deal_status_key, Int(2)),
        
        Approve()
    ])
    
    # Get contract information
    on_get_info = Seq([
        # Return contract state information
        # This would be called by frontend to check deal status
        Approve()
    ])
    
    # Delete application (only by seller after deal completion/refund)
    on_delete = Seq([
        Assert(Txn.sender() == App.globalGet(seller_key)),
        Assert(
            Or(
                App.globalGet(deal_status_key) == Int(1),  # Completed
                App.globalGet(deal_status_key) == Int(2)   # Refunded
            )
        ),
        Approve()
    ])
    
    program = Cond(
        [Txn.application_id() == Int(0), on_creation],
        [Txn.application_args[0] == Bytes("deposit"), on_deposit],
        [Txn.application_args[0] == Bytes("confirm_transfer"), on_confirm_transfer],
        [Txn.application_args[0] == Bytes("refund"), on_refund],
        [Txn.application_args[0] == Bytes("get_info"), on_get_info],
        [Txn.on_completion() == OnCall.DeleteApplication, on_delete],
    )
    
    return program


def approval_program():
    return real_estate_escrow()


def clear_state_program():
    """
    Clear state program - always approves
    """
    return Approve()


# Deployment helper functions
def compile_contract():
    """
    Compile the smart contract to TEAL
    """
    approval_teal = compileTeal(approval_program(), Mode.Application, version=8)
    clear_state_teal = compileTeal(clear_state_program(), Mode.Application, version=8)
    
    return approval_teal, clear_state_teal


def get_contract_schema():
    """
    Returns the contract's global and local state schema
    """
    return {
        "global_schema": {
            "num_ints": 4,      # deposit_amount, timeout, status, reserve
            "num_byte_slices": 3  # buyer, seller, property_hash
        },
        "local_schema": {
            "num_ints": 0,
            "num_byte_slices": 0
        }
    }


# Contract interaction helper class
class RealEstateEscrowContract:
    """
    Helper class for interacting with the deployed escrow contract
    """
    
    def __init__(self, app_id, algod_client):
        self.app_id = app_id
        self.algod_client = algod_client
    
    def create_escrow(self, creator, seller_address, property_hash, timeout_seconds):
        """
        Deploy a new escrow contract
        
        Args:
            creator: Account creating the contract
            seller_address: Address of property seller
            property_hash: Hash of property documents
            timeout_seconds: Seconds until automatic refund
        """
        from algosdk.future import transaction
        
        # Get network parameters
        params = self.algod_client.suggested_params()
        
        # Application arguments
        app_args = [
            seller_address.encode(),
            property_hash.encode(),
            str(timeout_seconds).encode()
        ]
        
        # Create transaction
        txn = transaction.ApplicationCreateTxn(
            sender=creator.address,
            sp=params,
            on_complete=transaction.OnComplete.NoOpOC,
            approval_program=compile_contract()[0],
            clear_program=compile_contract()[1],
            global_schema=transaction.StateSchema(**get_contract_schema()["global_schema"]),
            local_schema=transaction.StateSchema(**get_contract_schema()["local_schema"]),
            app_args=app_args
        )
        
        return txn
    
    def make_deposit(self, buyer, amount_microalgos):
        """
        Buyer deposits ALGO into escrow
        """
        from algosdk.future import transaction
        from algosdk import account
        
        params = self.algod_client.suggested_params()
        
        # Get application address
        app_info = self.algod_client.application_info(self.app_id)
        app_address = account.address_from_application_id(self.app_id)
        
        # Create atomic transaction group
        # 1. Call application with "deposit"
        app_call_txn = transaction.ApplicationCallTxn(
            sender=buyer.address,
            sp=params,
            index=self.app_id,
            on_complete=transaction.OnComplete.NoOpOC,
            app_args=["deposit"]
        )
        
        # 2. Payment to contract
        payment_txn = transaction.PaymentTxn(
            sender=buyer.address,
            sp=params,
            receiver=app_address,
            amt=amount_microalgos
        )
        
        # Group transactions
        gid = transaction.calculate_group_id([app_call_txn, payment_txn])
        app_call_txn.group = gid
        payment_txn.group = gid
        
        return [app_call_txn, payment_txn]
    
    def confirm_transfer(self, seller, property_hash=None):
        """
        Seller confirms property transfer
        """
        from algosdk.future import transaction
        
        params = self.algod_client.suggested_params()
        
        app_args = ["confirm_transfer"]
        if property_hash:
            app_args.append(property_hash)
        
        txn = transaction.ApplicationCallTxn(
            sender=seller.address,
            sp=params,
            index=self.app_id,
            on_complete=transaction.OnComplete.NoOpOC,
            app_args=app_args
        )
        
        return txn
    
    def request_refund(self, requester):
        """
        Request refund (buyer after timeout or seller cancellation)
        """
        from algosdk.future import transaction
        
        params = self.algod_client.suggested_params()
        
        txn = transaction.ApplicationCallTxn(
            sender=requester.address,
            sp=params,
            index=self.app_id,
            on_complete=transaction.OnComplete.NoOpOC,
            app_args=["refund"]
        )
        
        return txn
    
    def get_contract_state(self):
        """
        Get current contract state
        """
        app_info = self.algod_client.application_info(self.app_id)
        global_state = {}
        
        if "global-state" in app_info["params"]:
            for item in app_info["params"]["global-state"]:
                key = item["key"]
                value = item["value"]
                
                # Decode based on type
                if value["type"] == 1:  # bytes
                    decoded_value = base64.b64decode(value["bytes"]).decode('utf-8')
                elif value["type"] == 2:  # uint
                    decoded_value = value["uint"]
                
                global_state[base64.b64decode(key).decode('utf-8')] = decoded_value
        
        return global_state


# Example usage and deployment script
if __name__ == "__main__":
    import base64
    
    # Compile and print contract
    approval_teal, clear_state_teal = compile_contract()
    
    print("=== APPROVAL PROGRAM ===")
    print(approval_teal)
    print("\n=== CLEAR STATE PROGRAM ===")
    print(clear_state_teal)
    print("\n=== CONTRACT SCHEMA ===")
    print(get_contract_schema())
    
    print("\n=== DEPLOYMENT INSTRUCTIONS ===")
    print("1. Deploy contract with seller address, property hash, and timeout")
    print("2. Buyer calls 'deposit' with payment transaction")
    print("3. Seller calls 'confirm_transfer' to release funds")
    print("4. Anyone can call 'refund' after timeout")
    print("\nContract ensures trustless escrow with automatic timeout protection!")