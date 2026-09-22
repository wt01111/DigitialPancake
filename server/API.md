# Production API contract

All endpoints are same-origin under `/api`. Lists return `{items,total?}`, details return the object, actions return `{ok:true}`. Errors return `{error,code}`. Auth uses an HttpOnly `ep_session` cookie. State-changing requests require a matching `Origin` and JSON or multipart content type.

## Session and profile

- `GET /api/bootstrap` → `{user,config:{registrationEnabled,maxUploadBytes}}`; user fields: `id,email,nickname,role,permissions`.
- `POST /api/auth/request-code` `{email,purpose:"register"|"reset"}`.
- `POST /api/auth/register` `{email,code,password,nickname}`.
- `POST /api/auth/login` `{email,password}`. All users, including the owner, log in with a verified email address.
- `POST /api/auth/logout`; `POST /api/auth/change-password` `{currentPassword,newPassword}`; `POST /api/auth/reset-password` `{email,code,newPassword}`.
- `GET /api/me`; `PATCH /api/me` `{nickname,bio?}`.
- `GET /api/users/:id` returns only public `id,nickname,bio,articles,comments,reviews`; it never includes email, role, permissions, drafts, private reviews, or proof metadata.
- `GET /api/me/reviews|shops|submissions|drafts|notifications|bookmarks`; notifications return `{items,unreadCount}`. `POST /api/me/notifications/read` `{ids?:string[]}` persists read state.
- `POST|DELETE /api/me/bookmarks/:type/:id`, where type is `article|problem|shop`.

## Shops and reviews

- `GET /api/shops?q=keyword` → `{items}`; blank query always returns `[]`. Shop list fields: `id,name,aliases,ownerId,platform,url,condition,businessScope,positiveCount,negativeCount,neutralCount,siteAverage,siteReviewCount`.
- `GET /api/shops/:id` → shop plus `reviews`; only approved reviews are public. Workbook reviews include `sourceType,sentiment,reason,notes,supplements,questions,date,sourceSheet,sourceRow`. Site reviews include `author,rating,pros,cons,purchaseExperience,purchasedAt,orderPlatform,date`; no proof metadata is public.
- `POST /api/shops` JSON `{name,aliases?:string[],ownerId?,platform?,url?,condition?,businessScope}` → pending shop.
- `POST /api/shops/:id/reviews` multipart fields `rating,pros?,cons?,purchaseExperience,purchasedAt?,orderPlatform?,proof?`. `proof` accepts PNG/JPEG/WebP/PDF up to 50 MiB.
- `GET /api/reviews/:id/edit` returns the author's editable site review and private proof metadata. `PATCH /api/reviews/:id` accepts `{rating,pros?,cons?,purchaseExperience,purchasedAt?,orderPlatform?}` and preserves the existing proof; `POST /api/reviews/:id/submit` sends that same review ID back to moderation. Workbook reviews cannot be edited. An approved revision stays public from its immutable snapshot until the new revision is approved; proof metadata is never copied into that snapshot.
- `GET /api/files/:id` returns a private attachment only to its owner or a currently authorized reviewer.

## Articles, problems, comments

- `GET /api/articles?q=&category=` / `GET /api/articles/:id`. Article fields: `id,title,body,category,tags,excerpt,author,date,status,cover`; `cover` is `null` or `{id,name,url}` from the currently approved snapshot, with no generated fallback image.
- `POST /api/articles/drafts` JSON `{title,body,category?,tags?:string[],excerpt?}`; `GET /api/articles/drafts/:id` includes `coverImageId` and `cover`; `PATCH /api/articles/drafts/:id` accepts the same fields plus `coverImageId:string|null`; `POST /api/articles/drafts/:id/submit`. A cover must be an image uploaded by the author for that same article. Pending revisions keep the prior public snapshot, including its prior cover, until approval atomically replaces it.
- `POST /api/articles/drafts/:id/attachments` multipart field `file` (50 MiB); owner and content reviewers only.
- `POST /api/articles/drafts/:id/images` multipart field `image` (PNG/JPEG/WebP, 5 MiB) returns `{id,name,markdownUrl,markdown}`. `GET /api/article-images/:id` lets the author/content reviewers preview a draft image and anonymously serves an image only while the current visible published snapshot references it. PDFs and ordinary attachments remain authenticated through `/api/files/:id`.
- `GET /api/problems?q=&year=&category=&group=&competitionType=` / `GET /api/problems/:id`; categories are `signal`, `control`, `power`, `other`, competition types are `national`, `provincial`, and fields include `id,title,year,category,group,competitionType,competitionName,problemCode,body,sourcePage,sourceUrl,letter`.
- `POST /api/comments` `{targetType:"article"|"problem",targetId,parentId?,body}`. Replies use `parentId` and notify the parent/visible article author without duplicates or self-notifications.
- `GET /api/comments?targetType=&targetId=&sort=popular|latest&page=1&pageSize=20` returns `{items,sort,page,pageSize,total,focused}`. `focus=commentId` loads that comment's complete thread for notification anchors. Items include `likeCount,liked,deleted,canDelete,canReply`; deleted parents are content-free placeholders while visible replies remain threaded.
- `POST /api/comments/:id/like` toggles one vote per user. `DELETE /api/comments/:id` soft-deletes for the author or reports moderator. `POST /api/comments/:id/report` requires `{reason}` of 2–500 characters and rejects duplicate pending reports.

## Administration

- `GET /api/admin/queue?type=shops|reviews|articles|reports&status=pending|approved|rejected|hidden|all` (status defaults to pending).
- `POST /api/admin/shops/:id/decision`, `/reviews/:id/decision`, `/articles/:id/decision` with `{decision:"approved"|"rejected"|"hidden",reason?,expectedUpdatedAt?}`. Approval and rejection require the exact `updatedAt` from the queue item; stale or non-pending content returns 409 so an older moderation page can never approve a newer draft. Hiding an already public item does not require a version.
- `POST /api/admin/reports/:id/decision` `{decision:"dismissed"|"removed",reason?}`.
- `POST /api/admin/problems` `{title,...metadata}`.
- `POST /api/admin/problems/:id/attachments` multipart field `file`.
- Content permission: `GET /api/admin/problems?q=&status=all|published|hidden&year=&category=&group=&competitionType=&page=&pageSize=` and `PATCH /api/admin/problems/:id` with the editable problem fields plus `status`.
- Owner only: `GET /api/admin/accounts?q=&page=&pageSize=` returns all users and pagination metadata; `PATCH /api/admin/accounts/:id` accepts `{role?:"member"|"admin",enabled?,permissions?}`. Only verified users may be promoted. Owner accounts are immutable and every change revokes the target's sessions. `POST /api/admin/accounts` returns 405 because administrators must be promoted from registered users.
- `GET /api/admin/audit` → `id,actorId,action,entityType,entityId,detail,createdAt`.

`GET /healthz` checks process and database. In production `npm start` serves `/dist` and the API on `PORT` (default 3001). `DATABASE_PATH` and `UPLOAD_DIR` accept absolute paths. SMTP missing means `registrationEnabled:false` and code requests return 503. `npm run init-owner` reads `OWNER_PASSWORD` or hidden stdin and never prints it.
