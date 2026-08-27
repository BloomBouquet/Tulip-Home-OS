# Team Tulip HTTP API and Home Onboarding Implementation Plan

**Goal:** Add one-home onboarding and a framework-independent authenticated REST router that exposes the existing Tulip domain services.

**Architecture:** Keep HTTP transport separate from domain logic. `HomeManagementService` owns the one-home-per-user onboarding invariant; `TulipApiRouter` verifies Bouquet bearer tokens, resolves the current Home, delegates to existing services, and converts known domain errors into stable HTTP responses.

**Constraints:** No GPS or exact address fields. Non-owned resources remain 404. Invalid client input returns 400. Missing/invalid Bouquet auth returns 401. Waste-source failure remains a partial Today warning rather than a 5xx.

## Tasks

1. Extend HomeRepository with owner lookup and add HomeManagementService.
2. Add pure HTTP request/response contracts and authenticated router.
3. Cover Home, Today, Routine, Item, occurrence completion/undo, and history routes.
4. Defer the web API client/onboarding binding until the production Bouquet auth adapter contract is available; do not ship local-token assumptions into browser code.
5. Run core/offline-web verification and publish the feature branch.
