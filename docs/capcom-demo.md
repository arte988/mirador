# Aeolis CAPCOM: 2–3 minute demo

Before starting, have a local or deployed instance with Gemini configured and a network connection. Open `/walk`,
wait for the DTM and route plan, and have a separate instance without a Gemini key available for the fallback.
Responses, weather, route availability and the length of the compressed countdown depend on the current data and
simulation date; do not promise a particular answer. On a phone, use the bottom sheet to reach Safety. On a wider
screen, the Safety panel is available on `/plan`.

1. **Open CAPCOM (about 20 seconds).** Click **Open CAPCOM**, then **Start session**. Allow the microphone or use
   the text field; select **Onboard autonomous**. Say: “This is an AI assistant for a simulated EVA, not NASA
   flight rules or certification. Its answers depend on available tools and data.”
2. **Check the plan (about 30 seconds).** Hold **Hold to talk**, ask “Can I continue?”, and release; alternatively,
   type it and select **Send**. Point to the answer's evidence chips and their source and age. Expand the tool-call
   log to show the underlying call. Say: “The route and consumables are planning simulations; no data stays no data.”
3. **Ask about space weather (about 20 seconds).** Ask “What is the space weather?” Point out the source and any
   snapshot, stale or simulated label. Say: “DONKI reports space-weather events and model estimates, not measured
   radiation dose on the surface.” If the tool reports no data, show that result rather than guessing.
4. **Show the light-time demonstration (about 30 seconds, plus the displayed countdown).** After the answer ends,
   choose **Mission Control (Earth)** and ask another short question. Point to the countdown and the real round-trip
   estimate. Say: “The real Earth–Mars light time is estimated from JPL elements; we compress it 60 times for this
   demo. This is an interface simulation.” New requests wait for the countdown; **Stop session** cancels pending
   delivery. After delivery, switch back to **Onboard autonomous**.
5. **Rehearse an abort (about 35 seconds).** Open Safety and enable **Dust storm** or **Oxygen leak** in the
   **Scenario injector (simulation)**. Return to Walk, wait for replanning, and pause the walk so the simulated
   position stays fixed. Ask CAPCOM to propose an abort to the nearest refuge. If a proposal is available, point
   to the white dashed route and the card: “This is a proposal, and its budget check covers time only.” Select
   **Confirm abort** to start the simulated abort. If the route is unavailable or the proposal expires, say so;
   request a fresh proposal rather than inventing a route. Clear the injected scenario after the demo.
6. **Show the no-key fallback (about 20 seconds).** Switch to the separate instance without Gemini configured.
   On Walk, open CAPCOM and select **Start session**; show the not-configured message and the **Deterministic
   check — no AI** card. If needed, select **Can I continue?** to refresh it. Point to its source and age labels
   and any **No data** result. Say: “This is the same local planning and safety logic, without an LLM; it is still
   a prototype, not NASA flight rules.”
