//! Proxy pairing test using the cargo test subprocess framework
//!
//! This is a STRICT test that demonstrates proxy/vouching-based pairing:
//! 1. Alice pairs with Carol (direct pairing) - VERIFIED
//! 2. Alice pairs with Bob (direct pairing) - VERIFIED
//! 3. Alice auto-vouches Bob to Carol (proxy pairing) - VERIFIED
//! 4. Carol auto-accepts the vouch - VERIFIED
//! 5. Bob receives ProxyPairingComplete - VERIFIED
//!
//! The test FAILS if:
//! - Bob does not appear in Carol's paired devices list (Carol panics)
//! - Carol does not appear in Bob's paired devices list (Bob panics)
//! - Any device times out waiting for proxy pairing (30 second limit)
//!
//! Config: auto_vouch_to_all=true, auto_accept_vouched=true

use sd_core::testing::CargoTestRunner;
use sd_core::Core;
use std::env;
use std::path::PathBuf;
use std::time::Duration;
use tokio::time::timeout;

const TEST_DIR: &str = "/tmp/spacedrive-proxy-pairing-test";

/// Alice's scenario - pairs with Carol first, then Bob, then vouches Bob to Carol
#[tokio::test]
#[ignore]
async fn alice_proxy_pairing_scenario() {
	if env::var("TEST_ROLE").unwrap_or_default() != "alice" {
		return;
	}

	env::set_var("SPACEDRIVE_TEST_DIR", TEST_DIR);
	let data_dir = PathBuf::from(format!("{}/alice", TEST_DIR));
	let device_name = "Alice's Test Device";

	println!("Alice: Starting proxy pairing test");
	println!("Alice: Data dir: {:?}", data_dir);

	// Initialize Core
	println!("Alice: Initializing Core...");
	let mut core = timeout(Duration::from_secs(10), Core::new(data_dir))
		.await
		.unwrap()
		.unwrap();
	println!("Alice: Core initialized");

	core.device.set_name(device_name.to_string()).unwrap();

	// Enable auto-vouch for testing
	println!("Alice: Enabling auto-vouch for testing...");
	{
		let mut config = core.config.write().await;
		config.proxy_pairing.auto_vouch_to_all = true;
		config.save().unwrap();
	}
	println!("Alice: Auto-vouch enabled");

	// Initialize networking
	println!("Alice: Initializing networking...");
	timeout(Duration::from_secs(10), core.init_networking())
		.await
		.unwrap()
		.unwrap();
	tokio::time::sleep(Duration::from_secs(3)).await;
	println!("Alice: Networking initialized");

	// Phase 1: Pair with Carol
	println!("\n=== PHASE 1: Alice pairs with Carol ===");
	let (pairing_code_carol, _) = if let Some(networking) = core.networking() {
		timeout(
			Duration::from_secs(15),
			networking.start_pairing_as_initiator(false),
		)
		.await
		.unwrap()
		.unwrap()
	} else {
		panic!("Networking not initialized");
	};

	println!("Alice: Pairing code for Carol: {}", pairing_code_carol);
	std::fs::write(
		format!("{}/pairing_code_carol.txt", TEST_DIR),
		&pairing_code_carol,
	)
	.unwrap();
	println!("Alice: Waiting for Carol to pair...");

	// Wait for Carol to pair
	let mut attempts = 0;
	loop {
		tokio::time::sleep(Duration::from_secs(1)).await;
		let paired_devices = if let Some(networking) = core.networking() {
			networking.device_registry().read().await.get_paired_devices()
		} else {
			vec![]
		};
		if !paired_devices.is_empty() {
			println!("Alice: Carol paired successfully!");
			for device in &paired_devices {
				println!(
					"Alice sees: {} (ID: {})",
					device.device_name, device.device_id
				);
			}
			break;
		}
		attempts += 1;
		if attempts >= 45 {
			panic!("Alice: Timeout waiting for Carol");
		}
	}

	// Signal Carol pairing complete
	std::fs::write(format!("{}/alice_carol_paired.txt", TEST_DIR), "success").unwrap();

	// Phase 2: Pair with Bob
	println!("\n=== PHASE 2: Alice pairs with Bob ===");
	tokio::time::sleep(Duration::from_secs(2)).await;

	let (pairing_code_bob, _) = if let Some(networking) = core.networking() {
		timeout(
			Duration::from_secs(15),
			networking.start_pairing_as_initiator(false),
		)
		.await
		.unwrap()
		.unwrap()
	} else {
		panic!("Networking not initialized");
	};

	println!("Alice: Pairing code for Bob: {}", pairing_code_bob);
	std::fs::write(
		format!("{}/pairing_code_bob.txt", TEST_DIR),
		&pairing_code_bob,
	)
	.unwrap();
	println!("Alice: Waiting for Bob to pair...");

	// Wait for Bob to pair
	attempts = 0;
	let mut bob_device_id = None;
	loop {
		tokio::time::sleep(Duration::from_secs(1)).await;
		let paired_devices = if let Some(networking) = core.networking() {
			networking.device_registry().read().await.get_paired_devices()
		} else {
			vec![]
		};
		if paired_devices.len() >= 2 {
			println!("Alice: Bob paired successfully!");
			for device in &paired_devices {
				println!(
					"Alice sees: {} (ID: {})",
					device.device_name, device.device_id
				);
				if device.device_name == "Bob's Test Device" {
					bob_device_id = Some(device.device_id);
				}
			}
			break;
		}
		attempts += 1;
		if attempts >= 45 {
			panic!("Alice: Timeout waiting for Bob");
		}
	}

	let bob_id = bob_device_id.expect("Bob's device ID not found");
	println!("Alice: Bob's device ID: {}", bob_id);

	// Signal Bob pairing complete
	std::fs::write(format!("{}/alice_bob_paired.txt", TEST_DIR), "success").unwrap();

	// Phase 3: Vouch Bob to Carol
	println!("\n=== PHASE 3: Alice vouches Bob to Carol ===");
	tokio::time::sleep(Duration::from_secs(2)).await;

	// Get Carol's device ID
	let paired_devices = if let Some(networking) = core.networking() {
		networking.device_registry().read().await.get_paired_devices()
	} else {
		vec![]
	};
	let carol_id = paired_devices
		.iter()
		.find(|d| d.device_name == "Carol's Test Device")
		.map(|d| d.device_id)
		.expect("Carol not found");

	println!(
		"Alice: Vouching Bob (ID: {}) to Carol (ID: {})",
		bob_id, carol_id
	);

	// With auto_vouch_to_all enabled, Alice should automatically send
	// ProxyPairingRequest to Carol after pairing with Bob
	println!("Alice: Auto-vouch enabled - ProxyPairingRequest should be sent to Carol");
	println!("Alice: Carol should auto-accept and pair with Bob via proxy");

	// Write marker that vouching is ready
	std::fs::write(format!("{}/alice_vouching_ready.txt", TEST_DIR), "success").unwrap();

	// Wait for vouching to complete
	println!("Alice: Waiting for vouching to complete...");
	tokio::time::sleep(Duration::from_secs(15)).await;

	// Write success marker
	std::fs::write(format!("{}/alice_success.txt", TEST_DIR), "success").unwrap();
	println!("Alice: Test completed successfully");

	// Keep Alice alive for a bit longer
	tokio::time::sleep(Duration::from_secs(5)).await;
}

/// Carol's scenario - pairs with Alice first, then accepts vouch for Bob
#[tokio::test]
#[ignore]
async fn carol_proxy_pairing_scenario() {
	if env::var("TEST_ROLE").unwrap_or_default() != "carol" {
		return;
	}

	env::set_var("SPACEDRIVE_TEST_DIR", TEST_DIR);
	let data_dir = PathBuf::from(format!("{}/carol", TEST_DIR));
	let device_name = "Carol's Test Device";

	println!("Carol: Starting proxy pairing test");
	println!("Carol: Data dir: {:?}", data_dir);

	// Initialize Core
	println!("Carol: Initializing Core...");
	let mut core = timeout(Duration::from_secs(10), Core::new(data_dir))
		.await
		.unwrap()
		.unwrap();
	println!("Carol: Core initialized");

	core.device.set_name(device_name.to_string()).unwrap();

	// Verify auto-accept is enabled (it's true by default)
	println!("Carol: Auto-accept proxy pairing enabled (default)");

	// Initialize networking
	println!("Carol: Initializing networking...");
	timeout(Duration::from_secs(10), core.init_networking())
		.await
		.unwrap()
		.unwrap();
	tokio::time::sleep(Duration::from_secs(3)).await;
	println!("Carol: Networking initialized");

	// Phase 1: Pair with Alice
	println!("\n=== PHASE 1: Carol pairs with Alice ===");
	println!("Carol: Waiting for pairing code from Alice...");
	let pairing_code = loop {
		if let Ok(code) = std::fs::read_to_string(format!("{}/pairing_code_carol.txt", TEST_DIR)) {
			break code.trim().to_string();
		}
		tokio::time::sleep(Duration::from_millis(500)).await;
	};
	println!("Carol: Found pairing code");

	// Join pairing with Alice
	if let Some(networking) = core.networking() {
		timeout(
			Duration::from_secs(15),
			networking.start_pairing_as_joiner(&pairing_code, false),
		)
		.await
		.unwrap()
		.unwrap();
	}
	println!("Carol: Joined pairing with Alice");

	// Wait for pairing completion
	let mut attempts = 0;
	loop {
		tokio::time::sleep(Duration::from_secs(1)).await;
		let paired_devices = if let Some(networking) = core.networking() {
			networking.device_registry().read().await.get_paired_devices()
		} else {
			vec![]
		};
		if !paired_devices.is_empty() {
			println!("Carol: Paired with Alice successfully!");
			for device in &paired_devices {
				println!(
					"Carol sees: {} (ID: {})",
					device.device_name, device.device_id
				);
			}
			break;
		}
		attempts += 1;
		if attempts >= 30 {
			panic!("Carol: Timeout pairing with Alice");
		}
	}

	tokio::time::sleep(Duration::from_secs(5)).await;

	// Phase 2: Wait for proxy pairing from Alice vouching for Bob
	println!("\n=== PHASE 2: Carol receives proxy pairing for Bob ===");
	println!("Carol: Waiting for Alice to vouch Bob...");

	// Wait for vouching to be ready
	loop {
		if std::fs::read_to_string(format!("{}/alice_vouching_ready.txt", TEST_DIR)).is_ok() {
			break;
		}
		tokio::time::sleep(Duration::from_millis(500)).await;
	}
	println!("Carol: Alice has initiated vouching");

	// Carol should receive ProxyPairingRequest from Alice
	// With auto_accept_vouched=true, Carol will automatically accept and pair with Bob
	println!("Carol: Should receive ProxyPairingRequest and auto-accept");
	println!("Carol: Waiting for Bob to appear in paired devices...");

	// Wait for Bob to be paired via proxy
	attempts = 0;
	let mut bob_found = false;
	loop {
		tokio::time::sleep(Duration::from_secs(1)).await;
		let paired_devices = if let Some(networking) = core.networking() {
			networking.device_registry().read().await.get_paired_devices()
		} else {
			vec![]
		};

		// Look for Bob in paired devices
		for device in &paired_devices {
			if device.device_name == "Bob's Test Device" {
				println!("Carol: ✅ Bob found via proxy! (ID: {})", device.device_id);
				println!("Carol: Proxy pairing verified - Bob is in paired devices list");
				bob_found = true;
				break;
			}
		}

		if bob_found {
			break;
		}

		attempts += 1;
		if attempts >= 30 {
			println!("\n❌ CAROL TEST FAILURE");
			println!("Bob was NOT found in Carol's paired devices after 30 seconds");
			println!("\nActual: {} device(s) found:", paired_devices.len());
			for device in &paired_devices {
				println!("  - {} ({})", device.device_name, device.device_id);
			}
			panic!("Carol: FAILED - Bob not found via proxy pairing");
		}

		if attempts % 5 == 0 {
			println!("Carol: Waiting for Bob proxy pairing... ({}/30)", attempts);
		}
	}

	// Only write success if Bob was actually found via proxy
	if !bob_found {
		panic!("Carol: FAILED - Proxy pairing check failed");
	}

	println!("Carol: ✅ Proxy pairing SUCCESS - Bob paired via vouching!");
	std::fs::write(format!("{}/carol_success.txt", TEST_DIR), "success").unwrap();
	println!("Carol: Test completed");

	tokio::time::sleep(Duration::from_secs(5)).await;
}

/// Bob's scenario - pairs with Alice, then gets vouched to Carol
#[tokio::test]
#[ignore]
async fn bob_proxy_pairing_scenario() {
	if env::var("TEST_ROLE").unwrap_or_default() != "bob" {
		return;
	}

	env::set_var("SPACEDRIVE_TEST_DIR", TEST_DIR);
	let data_dir = PathBuf::from(format!("{}/bob", TEST_DIR));
	let device_name = "Bob's Test Device";

	println!("Bob: Starting proxy pairing test");
	println!("Bob: Data dir: {:?}", data_dir);

	// Initialize Core
	println!("Bob: Initializing Core...");
	let mut core = timeout(Duration::from_secs(10), Core::new(data_dir))
		.await
		.unwrap()
		.unwrap();
	println!("Bob: Core initialized");

	core.device.set_name(device_name.to_string()).unwrap();

	// Initialize networking
	println!("Bob: Initializing networking...");
	timeout(Duration::from_secs(10), core.init_networking())
		.await
		.unwrap()
		.unwrap();
	tokio::time::sleep(Duration::from_secs(3)).await;
	println!("Bob: Networking initialized");

	// Wait for Alice to pair with Carol first
	println!("\n=== PHASE 1: Bob waits for Alice-Carol pairing ===");
	println!("Bob: Waiting for Alice to pair with Carol...");
	loop {
		if std::fs::read_to_string(format!("{}/alice_carol_paired.txt", TEST_DIR)).is_ok() {
			break;
		}
		tokio::time::sleep(Duration::from_millis(500)).await;
	}
	println!("Bob: Alice and Carol are paired");

	// Phase 2: Pair with Alice
	println!("\n=== PHASE 2: Bob pairs with Alice ===");
	println!("Bob: Waiting for pairing code from Alice...");
	let pairing_code = loop {
		if let Ok(code) = std::fs::read_to_string(format!("{}/pairing_code_bob.txt", TEST_DIR)) {
			break code.trim().to_string();
		}
		tokio::time::sleep(Duration::from_millis(500)).await;
	};
	println!("Bob: Found pairing code");

	// Join pairing with Alice
	if let Some(networking) = core.networking() {
		timeout(
			Duration::from_secs(15),
			networking.start_pairing_as_joiner(&pairing_code, false),
		)
		.await
		.unwrap()
		.unwrap();
	}
	println!("Bob: Joined pairing with Alice");

	// Wait for pairing completion
	let mut attempts = 0;
	loop {
		tokio::time::sleep(Duration::from_secs(1)).await;
		let paired_devices = if let Some(networking) = core.networking() {
			networking.device_registry().read().await.get_paired_devices()
		} else {
			vec![]
		};
		if !paired_devices.is_empty() {
			println!("Bob: Paired with Alice successfully!");
			for device in &paired_devices {
				println!(
					"Bob sees: {} (ID: {})",
					device.device_name, device.device_id
				);
			}
			break;
		}
		attempts += 1;
		if attempts >= 30 {
			panic!("Bob: Timeout pairing with Alice");
		}
	}

	tokio::time::sleep(Duration::from_secs(5)).await;

	// Phase 3: Wait to be vouched to Carol
	println!("\n=== PHASE 3: Bob receives proxy pairing confirmation ===");
	println!("Bob: Waiting for Alice to vouch to Carol...");

	// Bob should receive ProxyPairingComplete message from Alice
	// containing Carol's acceptance, then store Carol as a proxied paired device
	println!("Bob: Should receive ProxyPairingComplete with Carol's acceptance");
	println!("Bob: Waiting for Carol to appear in paired devices...");

	// STRICT CHECK: Carol MUST appear in Bob's paired devices via proxy
	attempts = 0;
	let mut carol_found = false;
	println!("Bob: STRICT CHECK - Carol must appear in paired devices within 30 seconds");
	loop {
		tokio::time::sleep(Duration::from_secs(1)).await;
		let paired_devices = if let Some(networking) = core.networking() {
			networking.device_registry().read().await.get_paired_devices()
		} else {
			vec![]
		};

		// Look for Carol in paired devices
		for device in &paired_devices {
			if device.device_name == "Carol's Test Device" {
				println!("Bob: ✅ Carol found via proxy! (ID: {})", device.device_id);
				println!("Bob: Proxy pairing verified - Carol is in paired devices list");
				carol_found = true;
				break;
			}
		}

		if carol_found {
			break;
		}

		attempts += 1;
		if attempts >= 30 {
			println!("\n❌ BOB TEST FAILURE");
			println!("Bob: Carol was NOT found in paired devices after 30 seconds");
			println!("Bob: This means Bob did not receive ProxyPairingComplete");
			println!("Bob: Expected: Carol to appear in paired devices");
			println!("Bob: Actual: {} device(s) found", paired_devices.len());
			for device in &paired_devices {
				println!("  - {} ({})", device.device_name, device.device_id);
			}
			println!("\nDEBUG: Check logs above for:");
			println!("  1. Alice sending ProxyPairingComplete to Bob");
			println!("  2. Bob receiving and processing the complete message");
			println!("  3. Bob storing Carol as proxied paired device");
			panic!("Bob: FAILED - Carol not found via proxy pairing");
		}

		if attempts % 5 == 0 {
			println!("Bob: Waiting for Carol proxy pairing... ({}/30)", attempts);
		}
	}

	// Only write success if Carol was actually found via proxy
	if !carol_found {
		panic!("Bob: FAILED - Proxy pairing check failed");
	}

	println!("Bob: ✅ Proxy pairing SUCCESS - Carol paired via vouching!");
	std::fs::write(format!("{}/bob_success.txt", TEST_DIR), "success").unwrap();
	println!("Bob: Test completed");

	tokio::time::sleep(Duration::from_secs(5)).await;
}

/// Main test orchestrator - spawns three devices
#[tokio::test]
async fn test_proxy_pairing() {
	println!("Testing proxy/vouching pairing with three devices");

	// Clean up test directory
	let _ = std::fs::remove_dir_all(TEST_DIR);
	std::fs::create_dir_all(TEST_DIR).unwrap();

	let mut runner = CargoTestRunner::for_test_file("proxy_pairing_test")
		.with_timeout(Duration::from_secs(300))
		.add_subprocess("alice", "alice_proxy_pairing_scenario")
		.add_subprocess("carol", "carol_proxy_pairing_scenario")
		.add_subprocess("bob", "bob_proxy_pairing_scenario");

	// Start Alice first (she initiates both pairings)
	println!("Starting Alice as initiator...");
	runner
		.spawn_single_process("alice")
		.await
		.expect("Failed to spawn Alice");

	// Wait for Alice to initialize and generate first pairing code
	tokio::time::sleep(Duration::from_secs(8)).await;

	// Start Carol (pairs with Alice first)
	println!("Starting Carol as first joiner...");
	runner
		.spawn_single_process("carol")
		.await
		.expect("Failed to spawn Carol");

	// Wait for Alice-Carol pairing to complete
	tokio::time::sleep(Duration::from_secs(15)).await;

	// Start Bob (pairs with Alice second, gets vouched to Carol)
	println!("Starting Bob as second joiner...");
	runner
		.spawn_single_process("bob")
		.await
		.expect("Failed to spawn Bob");

	// Wait for all phases to complete
	let result = runner
		.wait_for_success(|_outputs| {
			let alice_success = std::fs::read_to_string(format!("{}/alice_success.txt", TEST_DIR))
				.map(|content| content.trim() == "success")
				.unwrap_or(false);
			let carol_success = std::fs::read_to_string(format!("{}/carol_success.txt", TEST_DIR))
				.map(|content| content.trim() == "success")
				.unwrap_or(false);
			let bob_success = std::fs::read_to_string(format!("{}/bob_success.txt", TEST_DIR))
				.map(|content| content.trim() == "success")
				.unwrap_or(false);

			alice_success && carol_success && bob_success
		})
		.await;

	match result {
		Ok(_) => {
			println!("\n✅ PROXY PAIRING TEST PASSED!");
			println!("   ✅ Alice paired with Carol (direct)");
			println!("   ✅ Alice paired with Bob (direct)");
			println!("   ✅ Alice auto-vouched Bob to Carol");
			println!("   ✅ Carol received and accepted Bob's vouch");
			println!("   ✅ Bob received ProxyPairingComplete");
			println!("   ✅ Bob and Carol are now paired via proxy vouching");
		}
		Err(e) => {
			println!("\n❌ PROXY PAIRING TEST FAILED: {}", e);
			println!("\nThis means the vouching protocol did not complete successfully.");
			println!("Check the logs above for where the protocol stopped.");
			for (name, output) in runner.get_all_outputs() {
				println!("\n=== {} OUTPUT ===\n{}", name.to_uppercase(), output);
			}
			panic!("Proxy pairing test failed - vouching protocol did not work");
		}
	}
}
