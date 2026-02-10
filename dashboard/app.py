import streamlit as st
from web3 import Web3
import json
import os

# 1. SETUP BLOCKCHAIN CONNECTION
if "w3" not in st.session_state:
    st.session_state.w3 = Web3(Web3.HTTPProvider("http://chain:8545"))

w3 = st.session_state.w3

# ------------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------------
st.set_page_config(layout="wide")
st.sidebar.header("🔌 Connection")

contract_address = st.sidebar.text_input("Contract Address", placeholder="Paste 0x... here")
abi_file_path = "ChainProof.json"

# Helper: basic address validation
def is_address(addr: str) -> bool:
    try:
        return bool(addr) and w3.is_address(addr)
    except Exception:
        return False

if contract_address and os.path.exists(abi_file_path):
    try:
        # Load ABI
        with open(abi_file_path, "r") as f:
            contract_data = json.load(f)
            abi = contract_data["abi"]

        if not is_address(contract_address):
            st.sidebar.error("Invalid contract address format.")
            st.stop()

        contract = w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=abi)
        st.sidebar.success("Contract Connected")

        # ------------------------------------------------------------------
        # DASHBOARD
        # ------------------------------------------------------------------
        st.title("☕ ChainProof Supply Chain")

        # IDENTITY PICKER
        accounts = w3.eth.accounts
        st.sidebar.divider()
        st.sidebar.subheader("👤 Who are you?")
        my_address = st.sidebar.selectbox("Select Actor", accounts)
        st.sidebar.info(f"Acting as: {my_address[:6]}...{my_address[-4:]}")

        col1, col2 = st.columns(2)

        # ------------------- COLUMN 1: ACTIONS -------------------
        with col1:
            st.subheader("🛠 Actions")
            tab1, tab2, tab3 = st.tabs(
                ["🌱 Harvest (Start)", "🚚 Update Status (Move)", "🔁 Transfer (Hand-off)"]
            )

            # ACTION A: HARVEST
            with tab1:
                st.write("Create a new batch on the blockchain.")
                origin = st.text_input("Origin", "Ethiopia - Yirgacheffe")
                ipfs = st.text_input("IPFS Hash", "QmData123...")

                if st.button("Harvest Batch"):
                    try:
                        tx = contract.functions.harvestBatch(origin, ipfs).transact({"from": my_address})
                        st.success(f"Harvested! Tx: {tx.hex()}")
                    except Exception as e:
                        st.error(f"Harvest error: {e}")

            # ACTION B: UPDATE STATUS
            with tab2:
                st.write("Change the status of an existing batch.")
                update_id = st.number_input("Batch ID to Update", min_value=1, step=1, key="update_id")

                # Enum mapping: 0=Harvested, 1=Processed, 2=Packed, 3=Shipped, 4=Received, 5=Sold
                status_options = {
                    "Processed": 1,
                    "Packed": 2,
                    "Shipped": 3,
                    "Received": 4,
                    "Sold": 5,
                }
                new_status = st.selectbox("New Status", list(status_options.keys()), key="new_status")

                if st.button("Update Status"):
                    try:
                        status_code = status_options[new_status]
                        tx = contract.functions.updateBatchState(update_id, status_code).transact({"from": my_address})
                        st.success(f"Status Updated! Tx: {tx.hex()}")
                    except Exception as e:
                        st.error(f"Update status error: {e}")
                        st.warning("Note: Status must move forward (no going backward).")

            # ACTION C: TRANSFER
            with tab3:
                st.write("Transfer a batch to the next handler.")
                transfer_id = st.number_input("Batch ID to Transfer", min_value=1, step=1, key="transfer_id")

                next_handler = st.selectbox(
                    "Next Handler",
                    [a for a in accounts if a != my_address],
                    key="next_handler",
                )

                if st.button("Transfer Batch"):
                    try:
                        tx = contract.functions.transferBatch(transfer_id, next_handler).transact({"from": my_address})
                        st.success(f"Transferred! Tx: {tx.hex()}")
                    except Exception as e:
                        st.error(f"Transfer error: {e}")
                        st.warning("Note: Only the CURRENT handler can transfer this batch.")

        # ------------------- COLUMN 2: TRACKER -------------------
        with col2:
            st.subheader("Public Ledger")
            track_id = st.number_input("Track Batch ID", min_value=1, step=1, key="track")

            if st.button("Trace Product"):
                try:
                    batch = contract.functions.batches(track_id).call()

                    if batch[0] == 0:
                        st.warning("Batch not found.")
                    else:
                        states = ["Harvested", "Processed", "Packed", "Shipped", "Received", "Sold"]

                        st.markdown(
                            f"""
                            ### Batch #{batch[0]}
                            - **📍 Origin:** {batch[2]}
                            - **👤 Current Handler:** `{batch[6]}`
                            - **📦 Status:** **{states[batch[4]]}**
                            - **📅 Timestamp:** {batch[5]}
                            """
                        )

                        progress = (batch[4] + 1) / 6
                        st.progress(progress)

                except Exception as e:
                    # IMPORTANT: show the real error for debugging
                    st.error(f"Error reading chain: {e}")

    except Exception as e:
        st.error(f"JSON/ABI Error. Please check ChainProof.json. Details: {e}")

else:
    st.warning("Please connect the contract in the sidebar.")
