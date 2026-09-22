# Production API contract

All endpoints are same-origin under `/api`. Lists return `{items,total?}`, details return the object, actions return `{ok:true}`. Errors return `{error,code}`. Auth uses an HttpOnly `ep_session` cookie. State-changing requests require a matching `Origin` and JSON or multipart content type.

## Session and profile

- `GET /api/bootstrap` → `{user,config:{registrationEnabled,maxUploadBytes}}`; user fields: `id,email,nickname,role,permissions`.
- `POST /api/auth/request-code` `{email,purpose:"register"|"reset"}`.
- `POST /api/auth/register` `{email,code,password,nickname}`.
- `POST /api/auth/login` `{email,password}`. All users, including the owner, log in with a verified email address.
- `POST /api/auth/logout`; `POST /api/auth/change-password` `{currentPassword,newPassword}`; `POST /api/auth/reset-password` `{email,code,newPassword}`.
- `GET /api/me`; `PATCH /api/me` `{nickname}`.
- `GET /api/me/reviews|shops|submissions|drafts|notifications|bookmarks`; `POST /api/me/notifications/read` `{ids?:string[]}`.
- `POST|DELETE /api/me/bookmarks/:type/:id`, where type is `article|problem|shop`.

## Shops and reviews

- `GET /api/shops?q=keyword` → `{items}`; blank query always returns `[]`. Shop list fields: `id,name,aliases,ownerId,platform,url,condition,businessScope,positiveCount,negativeCount,neutralCount,siteAverage,siteReviewCount`.
- `GET /api/shops/:id` → shop plus `reviews`; only approved reviews are public. Workbook reviews include `sourceType,sentiment,reason,notes,supplements,questions,date,sourceSheet,sourceRow`. Site reviews include `author,rating,pros,cons,purchaseExperience,purchasedAt,orderPlatform,date`; no proof metadata is public.
- `POST /api/shops` JSON `{name,aliases?:string[],ownerId?,platform?,url?,condition?,businessScope}` → pending shop.
- `POST /api/shops/:id/reviews` multipart fields `rating,pros?,cons?,purchaseExperience,purchasedAt?,orderPlatform?,proof?`. `proof` accepts PNG/JPEG/WebP/PDF up to 50 MiB.
- `GET /api/files/:id` returns a private attachment only to its owner or a currently authorized reviewer.

## Articles, problems, comments

- `GET /api/articles?q=&category=` / `GET /api/articles/:id`. Article fields: `id,title,body,category,tags,excerpt,author,date,status` (public endpoints only published).
- `POST /api/articles/drafts` JSON `{title,body,category?,tags?:string[],excerpt?}`; `PATCH /api/articles/drafts/:id` same fields; `POST /api/articles/drafts/:id/submit`.
- `POST /api/articles/drafts/:id/attachments` multipart field `file` (50 MiB); owner and content reviewers only.
- `GET /api/problems?q=&year=&category=&group=&competitionType=` / `GET /api/problems/:id`; categories are `signal`, `control`, `power`, `other`, competition types are `national`, `provincial`, and fields include `id,title,year,category,group,competitionType,competitionName,problemCode,body,sourcePage,sourceUrl,letter`.
- `POST /api/comments` `{targetType:"article"|"problem",targetId,parentId?,body}`. Replies use `parentId`.
- `GET /api/comments?targetType=&targetId=`; `POST /api/comments/:id/report` `{reason?}`.

## Administration

- `GET /api/admin/queue?type=shops|reviews|articles|reports&status=pending|approved|rejected|hidden|all` (status defaults to pending).
- `POST /api/admin/shops/:id/decision`, `/reviews/:id/decision`, `/articles/:id/decision` with `{decision:"approved"|"rejected"|"hidden",reason?}`.
- `POST /api/admin/reports/:id/decision` `{decision:"dismissed"|"removed",reason?}`.
- `POST /api/admin/problems` `{title,...metadata}`.
- `POST /api/admin/problems/:id/attachments` multipart field `file`.
- Content permission: `GET /api/admin/problems?q=&status=all|published|hidden&year=&category=&group=&competitionType=&page=&pageSize=` and `PATCH /api/admin/problems/:id` with the editable problem fields plus `status`.
- Owner only: `GET /api/admin/accounts?q=&page=&pageSize=` returns all users and pagination metadata; `PATCH /api/admin/accounts/:id` accepts `{role?:"member"|"admin",enabled?,permissions?}`. Only verified users may be promoted. Owner accounts are immutable and every change revokes the target's sessions. `POST /api/admin/accounts` returns 405 because administrators must be promoted from registered users.
- `GET /api/admin/audit` → `id,actorId,action,entityType,entityId,detail,createdAt`.

`GET /healthz` checks process and database. In production `npm start` serves `/dist` and the API on `PORT` (default 3001). `DATABASE_PATH` and `UPLOAD_DIR` accept absolute paths. SMTP missing means `registrationEnabled:false` and code requests return 503. `npm run init-owner` reads `OWNER_PASSWORD` or hidden stdin and never prints it.
