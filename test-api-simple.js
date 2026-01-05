/**
 * Simple API Test Script
 *
 * Run this in your browser console while logged into your app
 *
 * Usage:
 * 1. Open your app in browser (http://localhost:3000)
 * 2. Login
 * 3. Open Browser Console (F12)
 * 4. Copy and paste this entire script
 * 5. Run: testAllAPIs()
 */

async function testAllAPIs() {
    console.log('🧪 Starting API Tests...\n');

    // You need to provide a valid lead ID
    // Get it from: Open any lead → Check URL or network tab
    const leadId = prompt('Enter a Lead ID to test with:');

    if (!leadId) {
        console.error('❌ No lead ID provided. Test cancelled.');
        return;
    }

    console.log(`📋 Using Lead ID: ${leadId}\n`);

    // Test 1: Location Check-In
    console.log('📍 Test 1: Location Check-In');
    try {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude, accuracy } = position.coords;

            const response = await fetch('/api/locations/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id: leadId,
                    latitude: latitude,
                    longitude: longitude,
                    accuracy: accuracy,
                    notes: 'Test check-in from browser console'
                })
            });

            const data = await response.json();

            if (response.ok) {
                console.log('✅ Check-in successful!', data);
            } else {
                console.error('❌ Check-in failed:', data);
            }

            // Continue with other tests
            await testCallLog(leadId);
            await testLocationTrack(leadId);
            await testGetLocations(leadId);
        }, (error) => {
            console.error('❌ Geolocation error:', error);
            console.log('⚠️  Skipping location tests. Continuing with other tests...\n');
            testCallLog(leadId);
            testLocationTrack(leadId);
            testGetLocations(leadId);
        });
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

async function testCallLog(leadId) {
    console.log('\n📞 Test 2: Call Log');
    try {
        const response = await fetch('/api/calls/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_id: leadId,
                phone_number: '+1234567890',
                call_direction: 'OUTGOING',
                call_status: 'COMPLETED',
                call_started_at: new Date(Date.now() - 120000).toISOString(), // 2 min ago
                call_ended_at: new Date().toISOString(),
                duration_seconds: 120,
                talk_time_seconds: 115,
                ring_duration_seconds: 5,
                device_info: {
                    platform: 'browser',
                    userAgent: navigator.userAgent
                }
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ Call logged successfully!', data);
        } else {
            console.error('❌ Call log failed:', data);
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

async function testLocationTrack(leadId) {
    console.log('\n🗺️  Test 3: Location Tracking');
    try {
        const response = await fetch('/api/locations/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_id: leadId,
                latitude: 12.9716, // Bangalore
                longitude: 77.5946,
                accuracy: 10.5,
                location_type: 'tracking',
                tracking_session_id: 'test-session-' + Date.now(),
                notes: 'Test tracking point'
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ Location tracked successfully!', data);
        } else {
            console.error('❌ Location track failed:', data);
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

async function testGetLocations(leadId) {
    console.log('\n📊 Test 4: Get Location History');
    try {
        const response = await fetch(`/api/locations/${leadId}`);
        const data = await response.json();

        if (response.ok) {
            console.log(`✅ Found ${data.locations?.length || 0} location entries`);
            if (data.locations && data.locations.length > 0) {
                console.log('Sample entry:', data.locations[0]);
            }
        } else {
            console.error('❌ Failed to get locations:', data);
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run all tests
console.log('🚀 Ready to test! Run: testAllAPIs()');
console.log('Or test individually:');
console.log('  - testCallLog("your-lead-id")');
console.log('  - testLocationTrack("your-lead-id")');
console.log('  - testGetLocations("your-lead-id")');

