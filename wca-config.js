// ============================================================================
// WCA OAuth configuration — for verified WCA-ID linking on the Profile page.
// ============================================================================
// SETUP STEPS:
//   1. Visit https://www.worldcubeassociation.org/oauth/applications
//   2. Click "New Application".
//   3. Set:
//        Name:                Unleashed Cubing (or whatever you like)
//        Redirect URI:        the URL where the app is hosted
//                             (e.g. http://localhost:8000/  for local dev,
//                              or your GitHub Pages URL  for prod)
//        Scopes:              public
//        Confidential app:    NO  (we use PKCE for a public client)
//   4. Save, copy the "UID" (client ID) and paste it below.
//   5. Reload the app and click "Verify with WCA" in Edit Profile.
//
// The `redirect_uri` here MUST match exactly what you set in the WCA app
// (including the trailing slash). For most setups, leave the default
// (current page URL) and just ensure your registered redirect URI matches it.
// ============================================================================

export const wcaConfig = {
    client_id:    "uTYv0_9GnTqr_oV2RIaFrcvefA9Nso-UvGhiO8dmHXo",
    redirect_uri: window.location.origin + window.location.pathname
};
