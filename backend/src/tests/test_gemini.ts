import { suggestCinematicSpotsBase } from '../services/aiRouteService';

async function runTest() {
    console.log("Starting Gemini API Test...");
    try {
        // Tokyo Tower coordinates roughly
        const tokyoLat = 35.6586;
        const tokyoLng = 139.7454;

        console.log(`Starting from Tokyo: Lat ${tokyoLat}, Lng ${tokyoLng} for 120 minutes.`);
        const result = await suggestCinematicSpotsBase(120, tokyoLat, tokyoLng);

        console.log(`\n=== Success! Found ${result.routes.length} routes ===`);
        result.routes.forEach((route, r_idx) => {
            console.log(`\n--- Route ${r_idx + 1} ---`);
            console.log("Title:", route.title);
            console.log("Theme:", route.theme);
            console.log("Spots:");
            route.spots.forEach((spot, i) => {
                console.log(`  ${i + 1}. ${spot.location_name}`);
                console.log(`     Lat: ${spot.latitude}, Lng: ${spot.longitude}`);
                console.log(`     Guide: ${spot.shooting_guide}`);
                console.log(`     Reason: ${spot.reason_for_picking}`);
            });
        });

    } catch (error) {
        console.error("Test failed:", error);
    }
}

runTest();
