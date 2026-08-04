# OneShowSEO visible action and metric baseline

Captured: 2026-08-04 20:14 CST
Scope: current `main` application at commit `6ed67c7f50b25692558abebb51c9ac07035a45c9`

This matrix is the commercial baseline for task 1.1. A production control is classified as:

- **Real:** calls an authorized backend and persists or reads an authoritative source.
- **Mixed:** some values/actions are real while other presentation fields are derived or placeholders.
- **Demo:** intentional example data; it must be visibly labelled before a paid launch.
- **Unavailable:** server-controlled disabled capability with an honest recovery path.
- **Missing:** visible/inert or fabricated behavior that must not ship as commercial functionality.

## Public and authentication surfaces

| Surface | Visible actions and metrics | Current contract | State | Required treatment |
| --- | --- | --- | --- | --- |
| `/` | Product navigation, pricing/workspace CTA, language presentation | Static public page and links | Real | Keep public and accessible; add analytics/consent separately |
| `/pricing` | Plan comparison and account CTA | Static catalog copy | Mixed | Read versioned plan catalog; do not imply live checkout |
| `/login` | Password login, return destination, register/recovery links | `POST /api/auth/login`, secure session cookie | Real | Preserve; add session rotation and full localized errors |
| `/register` | Send code, register, terms/privacy | `POST /api/auth/send-code`, `POST /api/auth/register` | Real | Preserve; keep rate limits and single-use codes |
| Password recovery | Send/verify code and new password | `POST /api/auth/password-reset` | Real | Preserve; add dedicated visible recovery route/acceptance |
| `/privacy`, `/terms` | Legal copy | Static pages | Real | Legal review/version/acceptance evidence required |

## Customer workspace surfaces

| Module | Visible controls | Visible metrics/data | Backend/source today | State | Commercial action |
| --- | --- | --- | --- | --- | --- |
| Global shell | Project selector, navigation, language context, account menu, admin link, logout, notification bell | Current user, plan, project/page limits | Dashboard API + auth; notification bell has no source | Mixed | Keep real identity/navigation; mark notifications unavailable until implemented |
| Overview | Run audit, quick actions, open Tasks/Settings | SEO score, issues, tasks, agent activity, opportunities and trends | Audit/research/task data plus numerous presentation-derived cards | Mixed | Add provenance to every card; remove unbacked trend/traffic/AI metrics |
| Projects | Create/select project, filters, row menu, quick actions | Project health, agent states, last run, tags, team, activity | Project/audit/task records; several prototype columns lack sources | Mixed | Keep create/select; label unsupported actions/columns unavailable/no-data |
| Agent Center | Agent tabs, enable toggle, configure, run, view logs/history/cost/memory | Version, model, status, uptime, schedules, metrics and runs | Some audit/research/task derivation; registry/config/run source absent | Missing | Must use agent registry/runtime; no agent may claim running without a persisted run |
| Research Agent | Run research, create content/task, tabs, filters | Opportunities and capability readiness | `POST /api/projects/:id/research`, public crawl and research tables | Mixed | Real crawl evidence may display; volume/trend/competitor fields require configured sources |
| SEO Audit Agent | Run/schedule audit, inspect issue/fix/report | Pages, checks, evidence, category scores and runs | `POST /api/projects/:id/audit`, report route, persisted checks/pages | Real/Mixed | Core audit is real; schedule/auto-fix/performance sources stay unavailable until implemented |
| Keyword Agent | Discover, filters, add to plan, export, generate plan | Keywords, volume, KD, CPC, traffic, clusters/trends | Research opportunities; no authoritative keyword provider | Demo/Missing | Production must show provider-required/no-data; never estimate keyword metrics silently |
| Content Agent | Create content, pipeline actions, filters, optimize/publish | Drafts, scores, traffic, performance | Task/research derivation; no content document/pipeline source | Demo/Missing | Add content/artifact source before enabling actions |
| Publish Agent | Create/schedule/publish, platform filters, queue | Published/indexing/backlinks/shares/traffic | Task derivation; no CMS execution or indexing source | Demo/Missing | Mandatory approval + integration + external-effect records before enablement |
| GEO Agent | Run scan, schedule, recommendations | AI mentions/citations/answers/sentiment/AI traffic | Audit readiness derivation; no AI visibility provider | Demo/Missing | Separate technical readiness from real AI visibility and show no-data/provider-required |
| Analytics Agent | Generate/schedule/export report | Sessions, conversions, revenue, pages, keywords, countries | No GA/GSC authoritative performance snapshots | Demo/Missing | Require connected analytics/search sources and provenance |
| Approval Center | Filter/select, approve/reject/request changes/defer/schedule | Pending decisions, task risk, decision history | `/api/approvals`, task rows, decision table; rich evidence/change set absent | Mixed | Keep decisions; add immutable evidence/version/policy/execution data |
| Tasks | Filter/list, approve/dismiss, create task | Task status, priority, evidence and progress | `/api/tasks`, `seo_tasks` | Real/Mixed | Keep persisted tasks; add durable job/progress/assignee states |
| Content Library | Create/import/filter/edit/delete/view | Content items, SEO score, traffic, health | Mostly task/research projection; no content source of truth | Demo/Missing | Add content/artifact schema; explicitly unavailable before then |
| Knowledge Base | Add/import/search/filter/open/delete | Documents/pages/notes/FAQ, usage/storage | Audit pages/check/task projection; no knowledge asset source | Demo/Missing | Add knowledge/artifact source; no fabricated storage/usage |
| Reports | Create/schedule/download/share/favorite/delete | Report catalog/trends/schedules/exports | Audit report endpoint only; most report catalog is prototype | Mixed | Expose real audit reports; gate other report types |
| Rank Tracking | Add/import/export/filter keywords | Ranks, distribution, changes, trends, SERP features | No rank provider or rank snapshot tables | Demo/Missing | Show provider-required/no-data until real snapshots exist |
| AI Visibility | Add brand/project, filter, export | Mentions, citations, answer presence, AI traffic | No AI visibility provider/snapshots | Demo/Missing | Show provider-required/no-data; no sample customer values |
| Integrations | Connect/manage/test/filter providers | Connection state, API calls, health/activity | Customer connection lifecycle absent; admin data-source config exists | Demo/Missing | Build encrypted tenant-scoped vault and adapters |
| Project Settings | Save general/scope/goals, team/integration/SEO/AI/notification/advanced tabs, delete | Project details and health | Project records; complete update/delete contract absent | Mixed | Implement versioned PATCH/archive/delete and unavailable tabs |
| Team | Invite/filter/manage/revoke | Members, invites, seats, roles/activity | `/api/projects/:id/team`, membership/invite tables | Real/Mixed | Preserve; enforce full RBAC/project scopes and activity provenance |
| Billing | Change/compare plan, add credits, invoices, payment method, cancel | Plan, usage, invoices, payment methods | `/api/billing`, local billing tables; provider not configured | Unavailable/Mixed | Server-authoritative data may display; all live commercial mutations stay unavailable |
| API & MCP | Generate/revoke key, copy examples, webhook tabs | Keys, usage, endpoints and limits | `/api/api-access`, `/api/v1/projects`; MCP server/webhook delivery absent | Mixed | Keep scoped API keys after tenant migration; gate MCP/webhooks until real |
| Upgrade Plan | Monthly/yearly toggle, choose plan, manage billing, contact sales | Prices/features/current usage | Static catalog + current user plan | Mixed | Read catalog; plan changes/live checkout unavailable until provider enabled |

## Administrator surfaces

| Surface | Visible actions and metrics | Source today | State | Commercial action |
| --- | --- | --- | --- | --- |
| Admin overview | User/plan/status summaries | User records | Real | Add tenant, ledger, job, incident and health scopes later |
| Commercial users | Search/filter, plan/status/admin changes | `/api/admin/users` | Real | Split support/finance/security permissions and reason-required audit |
| Data sources | Configure/test/enable providers | `/api/admin/data-sources`, encrypted config | Real/Mixed | Ensure secrets never return; separate platform health from customer connections |

## API inventory

| Contract | Methods | Authentication | State |
| --- | --- | --- | --- |
| `/api/auth/login`, `/logout`, `/me` | POST/POST/GET | Session | Real |
| `/api/auth/send-code`, `/register`, `/password-reset`, `/verify`, `/resend-verification` | POST | Public/rate-limited | Real |
| `/api/dashboard` | GET | Session | Real aggregate with mixed frontend presentation |
| `/api/projects`, `/api/projects/:id/team` | GET/POST/PATCH/DELETE as implemented | Session/owner checks | Real but user-owned rather than tenant-owned |
| `/api/projects/:id/audit`, `/audit/report`, `/research` | POST/GET | Session/project owner | Real within current data-source limits |
| `/api/tasks`, `/api/approvals` | GET/POST/PATCH | Session/project owner | Real but not durable execution |
| `/api/billing`, `/api/api-access` | GET/POST/PATCH | Session/plan | Real metadata; live provider/MCP unavailable |
| `/api/v1/projects`, `/api/v1/projects/:id` | GET | API key | Real but user-scoped and minimally versioned |
| `/api/admin/users`, `/api/admin/data-sources` | GET/PATCH/POST | Platform admin session | Real |

## Release rule

No row classified **Demo**, **Missing**, or **Mixed** may be sold as completed functionality. A module can move to **Real** only after its API, authorization, tenant scope, persistence/provider effect, error/empty state, provenance, bilingual browser acceptance, and audit evidence are present.
