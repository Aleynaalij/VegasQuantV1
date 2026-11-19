# Private hosting — prepared configuration and current blockers

Target: existing project `vegas-quant-v1` (`prj_nOLCSmAPzjc5jayXwJ2gJNYXIT9P`), team `team_si4euHcFwtESIMr8T7lR9ewt`, custom environment `atlas-private-access`, exact reviewed SHA only. No Production target or custom domain. Existing allowance: one unused custom-environment slot; owner's $10 staging limit remains in force. No deployment or paid plan change has been made.

The connected Vercel tools list/get custom environments but do not expose creation. The authorized settings-page fallback reached the Vercel login screen; browser authentication is needed before that creation step. A connector sign-in does not sign in the browser. Do not create a normal Preview deployment or copy Preview/Production variables as a substitute.

The initial owner message lists the staging URL, publishable key, target name and four disabled-provider flags as allowed names. The current reviewed `private-access-stage-config.ts` and checked-in acceptance checklist additionally require these nonsecret combined-mode wiring variables. They are **not set**; the exact-name restriction must be reconciled before deployment rather than silently adding names or weakening the guard:

| Additional name | Required combined connected-mode value |
|---|---|
| VQ_STAGE_BUILD_PROFILE | combined |
| VQ_PRIVATE_ACCESS_PROJECT_REF | caynldluziwrzmvuslzg |
| STAGING_DISCOVERY_PROJECT | caynldluziwrzmvuslzg |
| STAGING_DISCOVERY_FIXTURES | false |
| STAGING_DISCOVERY_LINKED_PUBLICATIONS | false |
| STAGING_DISCOVERY_ENABLED | true |
| CONSUMER_UI_ENABLED | true |
| VQ_STAGE_RESEARCH_CONTRACT | vq-stage-session-v1 |

VERCEL_TARGET_ENV must be verified from the custom target; Vercel's own system variables are platform-generated. VQ_COMBINED_STAGE_BUILD is build-derived. Do not set VQ_STAGE_FEATURE_CONTRACT or force capability flags without the separately reviewed supplemental installer/registry state.

After authorized sign-in/name reconciliation: create the custom target without copying credential scopes; verify Vercel Authentication protection before any deployment; provision staging-only approved names through the provider; inspect effective inherited names and values privately for production endpoints/secrets under aliases; deploy exact SHA in combined mode with no custom domain. Report only env names, never values. Confirm READY, SHA/target/protection, before/after production invariants and spend before handing the URL to Claude.

Integration inspection currently shows team-level Resend and Stripe installations with selected-project scopes and **empty project lists**. Neither is assigned to this project according to the returned configuration records. GitHub is the source-control connection. Re-read project/resource/environment assignments before deployment; installed on the team does not mean connected to this custom environment.

Production remains NO-GO. These are unresolved hosting prerequisites, not an approval request to deploy a different target or alter production protections.
