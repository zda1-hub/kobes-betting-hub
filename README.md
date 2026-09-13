# Kobe's Betting Hub

Project workspace for the public website, paid membership, Discord access, pick operations, and publishing automations. Production checkout is live, while several audit, policy, and operational controls remain incomplete.

The authoritative current-state document is [PROJECT_CONTROL.md](PROJECT_CONTROL.md). Read it before relying on older plans or checklists.

## Required before paid launch

- Confirm legal business name, address, jurisdiction, and support email.
- Approve price, billing frequency, renewal, cancellation, and refund terms.
- Choose and configure payment and member-access providers.
- Have qualified counsel review the draft terms and privacy notice.
- Confirm the public domain and checkout destination.

## Start here

- [Project control file](PROJECT_CONTROL.md)
- [Project plan](docs/PROJECT_PLAN.md)
- [Today checklist](docs/TODAY_CHECKLIST.md)
- [Kobe meeting agenda](docs/MEETING_AGENDA.md)
- [Member onboarding playbook](docs/MEMBER_ONBOARDING_PLAYBOOK.md)
- [Member message library](templates/member-messages.md)
- [Source tracker](trackers/content-sources.csv)
- [Writing-style intake](trackers/kobe-writing-samples.md)

## Operating foundation

- [Member support process](docs/OPERATIONS_FOUNDATION.md)
- [Refund, cancellation, and access playbooks](docs/ISSUE_PLAYBOOKS.md)
- [KPI dashboard requirements](docs/KPI_DASHBOARD_REQUIREMENTS.md)
- [Pick-performance tracking plan](docs/PICK_PERFORMANCE_TRACKING.md)
- [Responsible-gambling disclosures](docs/RESPONSIBLE_GAMBLING.md)
- [Launch test plan](docs/LAUNCH_TEST_PLAN.md)
- [Starter pick ledger](trackers/pick-ledger.csv)
- [Manual content operations](docs/CONTENT_OPERATIONS.md)
- [Pick intake queue](trackers/pick-intake.csv)
- [Canonical pick log](trackers/pick-log.csv)
- [Kobe voice and communications system](docs/KOBE_VOICE_SYSTEM.md)

## Current boundary

No Discord account automation or partner-server integration will be built until the access approach is chosen. Everything else in this workspace is safe to prepare now.

## GitHub Pages deployment

This is a dependency-free static website. The GitHub Actions workflow at `.github/workflows/deploy-pages.yml` publishes the site when changes are pushed to `main`.

After creating an empty GitHub repository and pushing this folder:

1. Open the repository **Settings** → **Pages**.
2. Under **Build and deployment**, choose **GitHub Actions**.
3. Push or re-run the **Deploy site to GitHub Pages** workflow.

GitHub will provide the public URL in the workflow output. Do not put passwords, bot tokens, payment keys, or any customer data into this repository.
