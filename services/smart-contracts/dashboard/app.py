import json
import os
from datetime import datetime

import streamlit as st
from web3 import Web3


if "w3" not in st.session_state:
    st.session_state.w3 = Web3(
        Web3.HTTPProvider(os.getenv("CHAINPROOF_RPC_URL", "http://chain:8545"))
    )
w3 = st.session_state.w3

st.set_page_config(layout="wide")
st.sidebar.header("Connection")

abi_file_path = "ChainProof.json"
contract_key = os.getenv("CHAINPROOF_CONTRACT_KEY", "chainproof")
configured_chain_id = int(os.getenv("CHAINPROOF_CHAIN_ID", "31337"))
registry_path = os.getenv("CHAINPROOF_REGISTRY_PATH", "/config/contracts.json")

ROLE_LABELS = {
    0: "None",
    1: "Producer",
    2: "Processor",
    3: "Warehouse",
    4: "Transporter",
    5: "Customer",
}
ROLE_VALUES = {name: value for value, name in ROLE_LABELS.items()}
STATUS_LABELS = {
    0: "Active",
    1: "Consumed",
}


def is_address(addr: str) -> bool:
    try:
        return bool(addr) and w3.is_address(addr)
    except Exception:
        return False


def short_addr(addr: str) -> str:
    if not addr:
        return ""
    return f"{addr[:6]}...{addr[-4:]}"


def fmt_time(ts: int) -> str:
    return datetime.utcfromtimestamp(int(ts)).strftime("%Y-%m-%d %H:%M:%S UTC")


def parse_uint_list(raw: str):
    cleaned = [x.strip() for x in raw.split(",") if x.strip()]
    if not cleaned:
        return []
    return [int(value) for value in cleaned]


def parse_string_list(raw: str):
    return [x.strip() for x in raw.split(",") if x.strip()]


def role_name(role_value: int) -> str:
    return ROLE_LABELS.get(int(role_value), "Unknown")


def get_role(contract, account: str) -> int:
    return int(contract.functions.roles(account).call())


def batch_from_tuple(batch_tuple):
    return {
        "id": int(batch_tuple[0]),
        "creator": batch_tuple[1],
        "origin": batch_tuple[2],
        "ipfs_hash": batch_tuple[3],
        "quantity": int(batch_tuple[4]),
        "tracking_code": batch_tuple[5],
        "status": int(batch_tuple[6]),
        "created_at": int(batch_tuple[7]),
        "updated_at": int(batch_tuple[8]),
        "current_handler": batch_tuple[9],
    }


def load_registry(path: str):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def resolve_contract_address(registry: dict, key: str, chain_id: int):
    contract_map = registry.get(key, {})
    entry = contract_map.get(str(chain_id), {})
    return entry.get("address", "").strip()


def send_transaction(tx_call, from_address: str, chain_id: int, signer_private_key: str = ""):
    if signer_private_key:
        signer = w3.eth.account.from_key(signer_private_key)
        if signer.address.lower() == from_address.lower():
            tx_data = tx_call.build_transaction(
                {
                    "from": from_address,
                    "nonce": w3.eth.get_transaction_count(from_address),
                    "chainId": chain_id,
                }
            )
            try:
                tx_data["gas"] = int(w3.eth.estimate_gas(tx_data) * 1.2)
            except Exception:
                tx_data["gas"] = 6000000
            signed = signer.sign_transaction(tx_data)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            _ = w3.eth.wait_for_transaction_receipt(tx_hash)
            return tx_hash
    return tx_call.transact({"from": from_address})


if os.path.exists(abi_file_path):
    try:
        with open(abi_file_path, "r", encoding="utf-8") as file:
            contract_data = json.load(file)
            abi = contract_data["abi"]

        registry_data = load_registry(registry_path)

        detected_chain_id = configured_chain_id
        chain_detect_error = None
        try:
            detected_chain_id = int(w3.eth.chain_id)
        except Exception as exc:
            chain_detect_error = str(exc)

        resolved_contract_address = resolve_contract_address(
            registry_data,
            contract_key,
            detected_chain_id,
        )

        st.sidebar.info(f"RPC: {os.getenv('CHAINPROOF_RPC_URL', 'http://chain:8545')}")
        st.sidebar.info(f"Configured Chain ID: {configured_chain_id}")
        st.sidebar.info(f"Detected Chain ID: {detected_chain_id}")
        st.sidebar.info(f"Registry: {registry_path}")

        if chain_detect_error:
            st.sidebar.warning(f"Could not detect chain ID from provider: {chain_detect_error}")

        use_manual_override = st.sidebar.checkbox(
            "Advanced: Manually override contract address",
            value=False,
        )
        manual_override_address = ""
        if use_manual_override:
            manual_override_address = st.sidebar.text_input(
                "Contract Address Override",
                placeholder="Paste 0x... here",
            )

        contract_address = (
            manual_override_address.strip()
            if use_manual_override and manual_override_address.strip()
            else resolved_contract_address
        )

        if not contract_address:
            st.sidebar.error(
                "No contract address found. Deploy contract and update registry, or enable manual override."
            )
            st.stop()

        if not is_address(contract_address):
            st.sidebar.error(f"Invalid contract address format: {contract_address}")
            st.stop()

        contract_code = w3.eth.get_code(Web3.to_checksum_address(contract_address))
        if contract_code in (b"", b"\x00"):
            st.sidebar.error("No contract code found at resolved address.")
            st.stop()

        contract = w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=abi)
        _ = contract.functions.owner().call()
        st.sidebar.success("Contract connected")
        st.sidebar.info(f"Resolved Contract: {contract_address}")

        accounts = [Web3.to_checksum_address(account) for account in w3.eth.accounts]
        owner = Web3.to_checksum_address(contract.functions.owner().call())
        signer_private_key = os.getenv("CHAINPROOF_SIGNER_PRIVATE_KEY", "").strip()

        st.sidebar.divider()
        st.sidebar.subheader("Who are you?")
        address_input_mode = "manual"
        if accounts:
            address_input_mode = st.sidebar.radio(
                "Address Source",
                ["Known account", "Manual address"],
                horizontal=True,
            )

        if address_input_mode == "Known account":
            my_address = st.sidebar.selectbox("Active Address", accounts)
        else:
            my_address = st.sidebar.text_input(
                "Active Address",
                value=owner,
                help="Use an unlocked account or set CHAINPROOF_SIGNER_PRIVATE_KEY for this address.",
            ).strip()

        if not is_address(my_address):
            st.sidebar.error("Active Address must be a valid 0x address.")
            st.stop()

        my_address = Web3.to_checksum_address(my_address)

        my_role = get_role(contract, my_address)

        st.sidebar.info(f"Address: {short_addr(my_address)}")
        st.sidebar.info(f"Role: {role_name(my_role)}")
        st.sidebar.info(f"Owner: {short_addr(owner)}")
        if signer_private_key:
            try:
                signer_address = Web3.to_checksum_address(
                    w3.eth.account.from_key(signer_private_key).address
                )
                st.sidebar.info(f"Signer Key: {short_addr(signer_address)}")
            except Exception:
                st.sidebar.warning("CHAINPROOF_SIGNER_PRIVATE_KEY is set but invalid.")

        if my_address not in accounts and not signer_private_key:
            st.sidebar.warning(
                "Manual address selected without signer key. Write transactions may fail."
            )

        st.sidebar.divider()
        st.sidebar.subheader("Admin: Assign Roles")
        if my_address.lower() == owner.lower():
            target_input_mode = "manual"
            if accounts:
                target_input_mode = st.sidebar.radio(
                    "Target Source",
                    ["Known account", "Manual address"],
                    key="admin_target_mode",
                    horizontal=True,
                )
            if target_input_mode == "Known account":
                target_address = st.sidebar.selectbox("Target Address", accounts, key="admin_target")
            else:
                target_address = st.sidebar.text_input(
                    "Target Address",
                    value="",
                    key="admin_target_manual",
                ).strip()

            target_role_name = st.sidebar.selectbox(
                "Target Role",
                ["Producer", "Processor", "Warehouse", "Transporter", "Customer", "None"],
                key="admin_role",
            )
            if st.sidebar.button("Assign Role", key="assign_role_button"):
                try:
                    if not is_address(target_address):
                        st.sidebar.error("Target Address must be a valid 0x address.")
                        st.stop()
                    target_address = Web3.to_checksum_address(target_address)
                    tx_hash = send_transaction(
                        contract.functions.assignRole(target_address, ROLE_VALUES[target_role_name]),
                        my_address,
                        detected_chain_id,
                        signer_private_key,
                    )
                    st.sidebar.success(f"Role assigned. Tx: {tx_hash.hex()}")
                except Exception as exc:
                    st.sidebar.error(f"Role assignment failed: {exc}")
        else:
            st.sidebar.caption("Only owner can assign roles.")

        st.title("ChainProof Supply Chain Demo")
        action_col, trace_col = st.columns(2)

        with action_col:
            st.subheader("Role Actions")
            tab_labels = []
            if my_role == ROLE_VALUES["Producer"]:
                tab_labels = ["Harvest", "Transfer"]
            elif my_role == ROLE_VALUES["Processor"]:
                tab_labels = ["Split", "Transform", "Merge", "Receive", "Transfer"]
            elif my_role == ROLE_VALUES["Warehouse"]:
                tab_labels = ["Split", "Merge", "Receive", "Transfer"]
            elif my_role == ROLE_VALUES["Transporter"]:
                tab_labels = ["Receive", "Transfer"]
            elif my_role == ROLE_VALUES["Customer"]:
                tab_labels = ["Receive", "Track Guidance"]
            else:
                tab_labels = ["Track Guidance"]

            action_tabs = st.tabs(tab_labels)

            for idx, tab_name in enumerate(tab_labels):
                with action_tabs[idx]:
                    if tab_name == "Harvest":
                        origin = st.text_input("Origin", "Ethiopia - Yirgacheffe", key="harvest_origin")
                        ipfs_hash = st.text_input("IPFS Hash", "QmHarvest...", key="harvest_ipfs")
                        quantity = st.number_input(
                            "Quantity",
                            min_value=1,
                            step=1,
                            key="harvest_quantity",
                        )
                        tracking_code = st.text_input(
                            "Tracking Code",
                            "TRACK-001",
                            key="harvest_tracking",
                        )
                        if st.button("Create Harvest Batch", key="harvest_submit"):
                            try:
                                tx_hash = send_transaction(
                                    contract.functions.harvestBatch(
                                        origin,
                                        ipfs_hash,
                                        int(quantity),
                                        tracking_code,
                                    ),
                                    my_address,
                                    detected_chain_id,
                                    signer_private_key,
                                )
                                st.success(f"Harvest created. Tx: {tx_hash.hex()}")
                            except Exception as exc:
                                st.error(f"Harvest failed: {exc}")

                    elif tab_name == "Split":
                        parent_id = st.number_input(
                            "Parent Batch ID",
                            min_value=1,
                            step=1,
                            key="split_parent_id",
                        )
                        quantities_raw = st.text_input(
                            "Child Quantities (comma-separated)",
                            "40,60",
                            key="split_quantities",
                        )
                        ipfs_raw = st.text_input(
                            "Child IPFS Hashes (comma-separated)",
                            "QmChildA,QmChildB",
                            key="split_ipfs",
                        )
                        tracking_raw = st.text_input(
                            "Child Tracking Codes (comma-separated)",
                            "TRACK-CHILD-1,TRACK-CHILD-2",
                            key="split_tracking",
                        )
                        if st.button("Split Batch", key="split_submit"):
                            try:
                                quantities = parse_uint_list(quantities_raw)
                                hashes = parse_string_list(ipfs_raw)
                                codes = parse_string_list(tracking_raw)
                                tx_call = contract.functions.splitBatch(
                                    int(parent_id),
                                    quantities,
                                    hashes,
                                    codes,
                                )
                                tx_hash = send_transaction(
                                    tx_call,
                                    my_address,
                                    detected_chain_id,
                                    signer_private_key,
                                )
                                st.success(f"Split complete. Tx: {tx_hash.hex()}")
                            except Exception as exc:
                                st.error(f"Split failed: {exc}")

                    elif tab_name == "Transform":
                        input_ids_raw = st.text_input(
                            "Input Batch IDs (comma-separated)",
                            "1,2",
                            key="transform_inputs",
                        )
                        output_origin = st.text_input(
                            "Output Origin",
                            "Processed Facility - Stage A",
                            key="transform_origin",
                        )
                        output_ipfs = st.text_input(
                            "Output IPFS Hash",
                            "QmTransformOutput",
                            key="transform_ipfs",
                        )
                        output_qty = st.number_input(
                            "Output Quantity",
                            min_value=1,
                            step=1,
                            key="transform_quantity",
                        )
                        output_tracking = st.text_input(
                            "Output Tracking Code",
                            "TRACK-TRANSFORM-1",
                            key="transform_tracking",
                        )
                        process_type = st.text_input(
                            "Process Type",
                            "Roasting and Packaging",
                            key="transform_process",
                        )
                        if st.button("Transform Batches", key="transform_submit"):
                            try:
                                input_ids = parse_uint_list(input_ids_raw)
                                tx_hash = send_transaction(
                                    contract.functions.transformBatches(
                                        input_ids,
                                        output_origin,
                                        output_ipfs,
                                        int(output_qty),
                                        output_tracking,
                                        process_type,
                                    ),
                                    my_address,
                                    detected_chain_id,
                                    signer_private_key,
                                )
                                st.success(f"Transform complete. Tx: {tx_hash.hex()}")
                            except Exception as exc:
                                st.error(f"Transform failed: {exc}")

                    elif tab_name == "Merge":
                        input_ids_raw = st.text_input(
                            "Input Batch IDs (comma-separated)",
                            "3,4",
                            key="merge_inputs",
                        )
                        output_origin = st.text_input(
                            "Output Origin",
                            "Warehouse Consolidation",
                            key="merge_origin",
                        )
                        output_ipfs = st.text_input(
                            "Output IPFS Hash",
                            "QmMergeOutput",
                            key="merge_ipfs",
                        )
                        output_qty = st.number_input(
                            "Output Quantity",
                            min_value=1,
                            step=1,
                            key="merge_quantity",
                        )
                        output_tracking = st.text_input(
                            "Output Tracking Code",
                            "TRACK-MERGE-1",
                            key="merge_tracking",
                        )
                        if st.button("Merge Batches", key="merge_submit"):
                            try:
                                input_ids = parse_uint_list(input_ids_raw)
                                tx_hash = send_transaction(
                                    contract.functions.mergeBatches(
                                        input_ids,
                                        output_origin,
                                        output_ipfs,
                                        int(output_qty),
                                        output_tracking,
                                    ),
                                    my_address,
                                    detected_chain_id,
                                    signer_private_key,
                                )
                                st.success(f"Merge complete. Tx: {tx_hash.hex()}")
                            except Exception as exc:
                                st.error(f"Merge failed: {exc}")

                    elif tab_name == "Receive":
                        receive_id = st.number_input(
                            "Batch ID to Receive",
                            min_value=1,
                            step=1,
                            key=f"receive_id_{idx}",
                        )
                        if st.button("Receive Batch", key=f"receive_submit_{idx}"):
                            try:
                                tx_hash = send_transaction(
                                    contract.functions.receiveBatch(int(receive_id)),
                                    my_address,
                                    detected_chain_id,
                                    signer_private_key,
                                )
                                st.success(f"Batch received. Tx: {tx_hash.hex()}")
                            except Exception as exc:
                                st.error(f"Receive failed: {exc}")

                    elif tab_name == "Transfer":
                        transfer_id = st.number_input(
                            "Batch ID to Transfer",
                            min_value=1,
                            step=1,
                            key=f"transfer_id_{idx}",
                        )
                        recipient_input_mode = "manual"
                        selectable_recipients = [addr for addr in accounts if addr != my_address]
                        if selectable_recipients:
                            recipient_input_mode = st.radio(
                                "Recipient Source",
                                ["Known account", "Manual address"],
                                key=f"recipient_mode_{idx}",
                                horizontal=True,
                            )
                        if recipient_input_mode == "Known account":
                            recipient = st.selectbox(
                                "Recipient Address",
                                selectable_recipients,
                                key=f"recipient_{idx}",
                            )
                        else:
                            recipient = st.text_input(
                                "Recipient Address",
                                value="",
                                key=f"recipient_manual_{idx}",
                            ).strip()

                        if st.button("Initiate Transfer", key=f"transfer_submit_{idx}"):
                            try:
                                if not is_address(recipient):
                                    st.error("Recipient Address must be a valid 0x address.")
                                    st.stop()
                                recipient = Web3.to_checksum_address(recipient)
                                tx_hash = send_transaction(
                                    contract.functions.initiateTransfer(
                                        int(transfer_id),
                                        recipient,
                                    ),
                                    my_address,
                                    detected_chain_id,
                                    signer_private_key,
                                )
                                st.success(f"Transfer initiated. Tx: {tx_hash.hex()}")
                            except Exception as exc:
                                st.error(f"Transfer failed: {exc}")

                    elif tab_name == "Track Guidance":
                        st.info("Use the tracker panel to view full lineage by batch ID or tracking code.")

        with trace_col:
            st.subheader("Batch Tracker")
            track_id = st.number_input("Track by Batch ID", min_value=1, step=1, key="track_id")
            tracking_code = st.text_input("Or Tracking Code", value="", key="track_code")

            if st.button("Trace Product", key="trace_submit"):
                try:
                    resolved_batch_id = int(track_id)
                    if tracking_code.strip():
                        resolved_batch_id = int(
                            contract.functions.getBatchIdByTrackingCode(tracking_code.strip()).call()
                        )
                        if resolved_batch_id == 0:
                            st.warning("No batch found for the provided tracking code.")
                            st.stop()

                    batch_data = batch_from_tuple(contract.functions.batches(resolved_batch_id).call())
                    if batch_data["id"] == 0:
                        st.warning("Batch not found.")
                        st.stop()

                    handler_role = role_name(get_role(contract, batch_data["current_handler"]))
                    st.markdown(
                        f"""
                        ### Batch #{batch_data["id"]}
                        - **Origin:** {batch_data["origin"]}
                        - **Quantity:** {batch_data["quantity"]}
                        - **Tracking Code:** {batch_data["tracking_code"] or "N/A"}
                        - **Status:** {STATUS_LABELS.get(batch_data["status"], "Unknown")}
                        - **Current Handler:** {handler_role} (`{short_addr(batch_data["current_handler"])}`)
                        - **Created:** {fmt_time(batch_data["created_at"])}
                        - **Updated:** {fmt_time(batch_data["updated_at"])}
                        """
                    )

                    parents = contract.functions.getParentBatches(resolved_batch_id).call()
                    children = contract.functions.getChildBatches(resolved_batch_id).call()
                    st.write(f"Parent Batches: {parents if parents else 'None'}")
                    st.write(f"Child Batches: {children if children else 'None'}")

                    timeline = []

                    harvest_logs = contract.events.BatchHarvested().get_logs(
                        from_block=0,
                        argument_filters={"id": resolved_batch_id},
                    )
                    for evt in harvest_logs:
                        timeline.append({
                            "type": "HARVEST",
                            "timestamp": int(evt["args"]["timestamp"]),
                            "block": evt["blockNumber"],
                            "text": f"Harvested by {role_name(get_role(contract, evt['args']['creator']))} ({short_addr(evt['args']['creator'])})",
                            "tx": evt["transactionHash"].hex(),
                        })

                    split_logs = contract.events.BatchSplit().get_logs(from_block=0)
                    for evt in split_logs:
                        parent_id = int(evt["args"]["parentId"])
                        child_ids = [int(x) for x in evt["args"]["childIds"]]
                        if resolved_batch_id == parent_id or resolved_batch_id in child_ids:
                            timeline.append({
                                "type": "SPLIT",
                                "timestamp": int(evt["args"]["timestamp"]),
                                "block": evt["blockNumber"],
                                "text": f"Split event: parent {parent_id}, children {child_ids}",
                                "tx": evt["transactionHash"].hex(),
                            })

                    transform_logs = contract.events.BatchTransformed().get_logs(from_block=0)
                    for evt in transform_logs:
                        input_ids = [int(x) for x in evt["args"]["inputBatchIds"]]
                        output_id = int(evt["args"]["outputBatchId"])
                        if resolved_batch_id == output_id or resolved_batch_id in input_ids:
                            timeline.append({
                                "type": "TRANSFORM",
                                "timestamp": int(evt["args"]["timestamp"]),
                                "block": evt["blockNumber"],
                                "text": f"Transform '{evt['args']['processType']}': inputs {input_ids} -> output {output_id}",
                                "tx": evt["transactionHash"].hex(),
                            })

                    merge_logs = contract.events.BatchMerged().get_logs(from_block=0)
                    for evt in merge_logs:
                        input_ids = [int(x) for x in evt["args"]["inputBatchIds"]]
                        output_id = int(evt["args"]["outputBatchId"])
                        if resolved_batch_id == output_id or resolved_batch_id in input_ids:
                            timeline.append({
                                "type": "MERGE",
                                "timestamp": int(evt["args"]["timestamp"]),
                                "block": evt["blockNumber"],
                                "text": f"Merge: inputs {input_ids} -> output {output_id}",
                                "tx": evt["transactionHash"].hex(),
                            })

                    transfer_logs = contract.events.BatchTransferInitiated().get_logs(
                        from_block=0,
                        argument_filters={"id": resolved_batch_id},
                    )
                    for evt in transfer_logs:
                        from_addr = evt["args"]["from"]
                        to_addr = evt["args"]["to"]
                        timeline.append({
                            "type": "TRANSFER",
                            "timestamp": int(evt["args"]["timestamp"]),
                            "block": evt["blockNumber"],
                            "text": f"Transfer initiated: {role_name(get_role(contract, from_addr))} ({short_addr(from_addr)}) -> {role_name(get_role(contract, to_addr))} ({short_addr(to_addr)})",
                            "tx": evt["transactionHash"].hex(),
                        })

                    receive_logs = contract.events.BatchReceived().get_logs(
                        from_block=0,
                        argument_filters={"id": resolved_batch_id},
                    )
                    for evt in receive_logs:
                        receiver = evt["args"]["receiver"]
                        timeline.append({
                            "type": "RECEIVE",
                            "timestamp": int(evt["args"]["timestamp"]),
                            "block": evt["blockNumber"],
                            "text": f"Batch received by {role_name(get_role(contract, receiver))} ({short_addr(receiver)})",
                            "tx": evt["transactionHash"].hex(),
                        })

                    consumed_logs = contract.events.BatchConsumed().get_logs(
                        from_block=0,
                        argument_filters={"id": resolved_batch_id},
                    )
                    for evt in consumed_logs:
                        handler = evt["args"]["handler"]
                        timeline.append({
                            "type": "CONSUMED",
                            "timestamp": int(evt["args"]["timestamp"]),
                            "block": evt["blockNumber"],
                            "text": f"Batch consumed by {role_name(get_role(contract, handler))} ({short_addr(handler)})",
                            "tx": evt["transactionHash"].hex(),
                        })

                    timeline.sort(key=lambda item: (item["timestamp"], item["block"]))
                    st.divider()
                    st.subheader("Timeline")
                    if not timeline:
                        st.info("No timeline events found for this batch.")
                    else:
                        for i, item in enumerate(timeline, start=1):
                            tx_short = f"{item['tx'][:10]}...{item['tx'][-8:]}"
                            st.markdown(
                                f"**{i}. {item['type']}**  \n"
                                f"- {item['text']}  \n"
                                f"- When: {fmt_time(item['timestamp'])}  \n"
                                f"- Tx: `{tx_short}`"
                            )
                            st.divider()
                except Exception as exc:
                    st.error(f"Trace failed: {exc}")

    except Exception as exc:
        st.error(f"JSON/ABI Error. Check ChainProof.json. Details: {exc}")
else:
    st.warning("Missing ABI file (dashboard/ChainProof.json).")
