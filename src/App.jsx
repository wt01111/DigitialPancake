import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Bookmark,
  Check,
  ChevronRight,
  Download,
  FolderOpen,
  LogOut,
  Menu,
  MessageSquare,
  PenLine,
  Search,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { Provider, api, asItems, useSite } from "./store";
import { topics, starterMarkdown } from "./data";
import { Photo, PhotoCredit, PhotoCredits, photoForArticle } from "./Photos";
const Markdown = lazy(() => import("./Markdown"));
const fmt = (v) => (v ? new Date(v).toLocaleDateString("zh-CN") : "");
const fileSize = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return String(value || "");
  return n >= 1073741824
    ? `${(n / 1073741824).toFixed(1)} GiB`
    : n >= 1048576
      ? `${(n / 1048576).toFixed(1)} MiB`
      : n >= 1024
        ? `${Math.round(n / 1024)} KiB`
        : `${n} B`;
};
const permit = (u, p) => u?.role === "owner" || u?.permissions?.includes(p);
function Loading() {
  return (
    <div className="state" aria-live="polite">
      <i className="spinner" />
      正在加载…
    </div>
  );
}
function Err({ error, retry }) {
  return error ? (
    <div className="error-box" role="alert">
      <strong>暂时无法完成</strong>
      <span>{error}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          重试
        </button>
      )}
    </div>
  ) : null;
}
function Empty({
  title = "暂时没有内容",
  text = "这里还没有已公开的内容。",
  children,
}) {
  return (
    <div className="empty">
      <FolderOpen />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function MD({ children }) {
  return (
    <Suspense fallback={<Loading />}>
      <Markdown>{children}</Markdown>
    </Suspense>
  );
}
function useLoad(path, deps = []) {
  const [s, setS] = useState({ loading: true, data: null, error: "" });
  const request = useRef(0);
  const load = async () => {
    const current = ++request.current;
    setS((x) => ({ ...x, loading: true, error: "" }));
    try {
      const data = await api(path);
      if (current === request.current)
        setS({ loading: false, data, error: "" });
    } catch (e) {
      if (current === request.current)
        setS({ loading: false, data: null, error: e.message });
    }
  };
  useEffect(() => {
    load();
    return () => {
      request.current += 1;
    };
  }, deps);
  return { ...s, reload: load };
}
function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        e<span />
      </span>
      <span>
        电子<span className="brand-blue">煎</span>饼
      </span>
    </Link>
  );
}
function Header() {
  const { user, refresh } = useSite();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      await refresh();
    } catch {}
  }
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav className={`nav ${open ? "open" : ""}`}>
          <NavLink to="/" end>
            首页
          </NavLink>
          <NavLink to="/problems">历年赛题</NavLink>
          <NavLink to="/articles">学习文章</NavLink>
          <NavLink to="/topics">学习专题</NavLink>
          <NavLink to="/shops">店铺口碑</NavLink>
        </nav>
        <div className="header-actions">
          <Link className="write-link" to="/write">
            <PenLine size={17} />
            写文章
          </Link>
          {user ? (
            <>
              <Link
                className="icon-button"
                to="/account?tab=notifications"
                aria-label="通知"
              >
                <Bell />
              </Link>
              <Link className="avatar" to="/account">
                {user.nickname?.[0] || "我"}
              </Link>
              <button
                className="icon-button"
                onClick={logout}
                aria-label="退出"
              >
                <LogOut />
              </button>
            </>
          ) : (
            <Link className="button primary small" to="/auth">
              登录 / 注册
            </Link>
          )}
          <button
            className="icon-button mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label="菜单"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
function Layout({ children }) {
  const { bootstrapError } = useSite();
  return (
    <>
      <Header />
      {bootstrapError && (
        <div className="global-error">服务器连接失败：{bootstrapError}</div>
      )}
      <main>{children}</main>
      <footer className="footer">
        <div>
          <Brand />
          <p>记录从想法到电路的每一次探索。</p>
        </div>
        <div className="footer-links">
          <Link to="/problems">电赛题库</Link>
          <Link to="/articles">学习文章</Link>
          <Link to="/shops">店铺口碑</Link>
          <Link to="/about">关于本站</Link>
          <span>© 2026 电子煎饼</span>
        </div>
      </footer>
    </>
  );
}
function SearchBox({
  value: out = "",
  onSearch,
  placeholder = "搜索赛题、文章或知识点…",
  large,
}) {
  const [value, setValue] = useState(out);
  const nav = useNavigate();
  useEffect(() => setValue(out), [out]);
  return (
    <form
      className={`searchbox ${large ? "searchbox-large" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch
          ? onSearch(value.trim())
          : nav(`/search?q=${encodeURIComponent(value.trim())}`);
      }}
    >
      <Search />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="search-submit">搜索</button>
    </form>
  );
}
function Save({ type, id, initial = false }) {
  const { user } = useSite();
  const nav = useNavigate();
  const [on, setOn] = useState(initial);
  async function toggle() {
    if (!user) return nav("/auth");
    try {
      await api(`/me/bookmarks/${type}/${id}`, {
        method: on ? "DELETE" : "POST",
      });
      setOn(!on);
    } catch (e) {
      alert(e.message);
    }
  }
  return (
    <button
      className={`icon-button ${on ? "saved" : ""}`}
      onClick={toggle}
      aria-label={on ? "取消收藏" : "收藏"}
    >
      <Bookmark fill={on ? "currentColor" : "none"} />
    </button>
  );
}
function Card({ a }) {
  return (
    <article className="article-card">
      <Link className="article-photo" to={`/articles/${a.id}`}>
        <Photo id={photoForArticle(a)} decorative />
      </Link>
      <div className="article-copy">
        <div className="eyebrow">{a.category || "学习文章"}</div>
        <Link className="article-title" to={`/articles/${a.id}`}>
          {a.title}
        </Link>
        <p>{a.excerpt || ""}</p>
        <div className="article-meta">
          <span>{a.author?.nickname || a.author || "站内作者"}</span>
          <span>{fmt(a.date || a.createdAt)}</span>
          <Save type="article" id={a.id} initial={a.bookmarked} />
        </div>
      </div>
    </article>
  );
}
function Problem({ p }) {
  const typeName =
    { signal: "信号", control: "控制", power: "电源", other: "其他" }[p.type] ||
    p.topic ||
    p.category;
  return (
    <article className="problem-row">
      <div className="problem-letter">{p.problemCode || p.letter || "题"}</div>
      <div className="problem-copy">
        <div className="eyebrow">
          {[
            p.year,
            p.level,
            {
              all: "通用组",
              undergraduate: "本科组",
              vocational: "高职高专组",
            }[p.group] || p.group,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <Link className="problem-title" to={`/problems/${p.id}`}>
          {p.title}
        </Link>
        <div className="tags">
          {(p.tags || []).map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      </div>
      <div className="problem-right">
        <span>{typeName}</span>
        <Save type="problem" id={p.id} initial={p.bookmarked} />
        <Link className="icon-button" to={`/problems/${p.id}`}>
          <ChevronRight />
        </Link>
      </div>
    </article>
  );
}
function Rows({ type, items }) {
  if (!items.length)
    return (
      <Empty
        title={type === "articles" ? "还没有公开文章" : "赛题库正在整理"}
        text="内容发布后会显示在这里。"
      />
    );
  return (
    <div className={type === "articles" ? "article-grid" : "problem-list"}>
      {items.map((x) =>
        type === "articles" ? (
          <Card key={x.id} a={x} />
        ) : (
          <Problem key={x.id} p={x} />
        ),
      )}
    </div>
  );
}
function Home() {
  const p = useLoad("/problems", []),
    a = useLoad("/articles", []);
  return (
    <>
      <section className="hero photo-hero">
        <div className="hero-copy">
          <div className="hero-kicker">电子设计，从这里开始</div>
          <h1>
            让每一次探索，<span>都有收获。</span>
          </h1>
          <p>查找历年赛题，分享设计经验，和同路人一起把想法做出来。</p>
          <SearchBox large />
        </div>
        <figure className="hero-photograph">
          <Photo id="soldering" priority />
          <figcaption>
            <span>从一根导线、一次焊接开始。</span>
            <PhotoCredit id="soldering" />
          </figcaption>
        </figure>
      </section>
      <div className="container">
        {[
          ["最新赛题", p, "problems"],
          ["最新文章", a, "articles"],
        ].map(([title, r, type]) => (
          <section className="section-block" key={type}>
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  {type === "problems" ? "从题目到实践" : "来自真实实践"}
                </span>
                <h2>{title}</h2>
              </div>
              <Link className="text-link" to={`/${type}`}>
                查看全部
                <ArrowRight />
              </Link>
            </div>
            {r.loading ? (
              <Loading />
            ) : r.error ? (
              <Err error={r.error} retry={r.reload} />
            ) : (
              <Rows type={type} items={asItems(r.data).slice(0, 4)} />
            )}
          </section>
        ))}
      </div>
    </>
  );
}
function Listing({ type }) {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "",
    category = sp.get("category") || "",
    year = sp.get("year") || "",
    problemType = sp.get("type") || "",
    group = sp.get("group") || "",
    competitionType = sp.get("competitionType") || "",
    page = Math.max(1, Number(sp.get("page")) || 1);
  const ps = new URLSearchParams();
  if (q) ps.set("q", q);
  if (category) ps.set("category", category);
  if (year) ps.set("year", year);
  if (problemType) ps.set("type", problemType);
  if (group) ps.set("group", group);
  if (competitionType) ps.set("competitionType", competitionType);
  if (type === "problems") {
    ps.set("page", String(page));
    ps.set("pageSize", "24");
  }
  const r = useLoad(`/${type}?${ps}`, [
    q,
    category,
    year,
    problemType,
    group,
    competitionType,
    page,
  ]);
  const article = type === "articles";
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="section-kicker">
          {article ? "KNOWLEDGE NOTES" : "COMPETITION ARCHIVE"}
        </span>
        <h1>{article ? "学习文章" : "历年赛题"}</h1>
        <p>
          {article
            ? "阅读社区成员提交并通过审核的实践记录。"
            : "从题目出发，连接知识、方案与实践。"}
        </p>
      </div>
      <SearchBox
        value={q}
        onSearch={(v) =>
          setSp({
            ...(category && { category }),
            ...(year && { year }),
            ...(problemType && { type: problemType }),
            ...(group && { group }),
            ...(competitionType && { competitionType }),
            ...(v && { q: v }),
          })
        }
      />
      {article && (
        <div className="chips">
          <button
            className={!category ? "selected" : ""}
            onClick={() => setSp(q ? { q } : {})}
          >
            全部
          </button>
          {topics.map((t) => (
            <button
              key={t.name}
              className={category === t.name ? "selected" : ""}
              onClick={() => setSp({ ...(q && { q }), category: t.name })}
            >
              {t.short}
            </button>
          ))}
        </div>
      )}
      {!article && (
        <div className="problem-filters" aria-label="赛题筛选">
          <label>
            竞赛
            <select
              value={competitionType}
              onChange={(e) =>
                setSp({
                  ...(q && { q }),
                  ...(year && { year }),
                  ...(problemType && { type: problemType }),
                  ...(group && { group }),
                  ...(e.target.value && { competitionType: e.target.value }),
                })
              }
            >
              <option value="">全部竞赛</option>
              <option value="national">全国电赛</option>
              <option value="provincial">省赛 TI 杯</option>
            </select>
          </label>
          <label>
            年份
            <select
              value={year}
              onChange={(e) =>
                setSp({
                  ...(q && { q }),
                  ...(problemType && { type: problemType }),
                  ...(group && { group }),
                  ...(competitionType && { competitionType }),
                  ...(e.target.value && { year: e.target.value }),
                })
              }
            >
              <option value="">全部年份</option>
              {[...new Set([...(r.data?.facets?.years || [])])]
                .sort((a, b) => b - a)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          </label>
          <label>
            类型
            <select
              value={problemType}
              onChange={(e) =>
                setSp({
                  ...(q && { q }),
                  ...(year && { year }),
                  ...(group && { group }),
                  ...(competitionType && { competitionType }),
                  ...(e.target.value && { type: e.target.value }),
                })
              }
            >
              <option value="">全部类型</option>
              <option value="signal">信号</option>
              <option value="control">控制</option>
              <option value="power">电源</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label>
            组别
            <select
              value={group}
              onChange={(e) =>
                setSp({
                  ...(q && { q }),
                  ...(year && { year }),
                  ...(problemType && { type: problemType }),
                  ...(competitionType && { competitionType }),
                  ...(e.target.value && { group: e.target.value }),
                })
              }
            >
              <option value="">全部组别</option>
              {(
                r.data?.facets?.groups || ["undergraduate", "vocational", "all"]
              ).map((g) => (
                <option key={g} value={g}>
                  {{
                    all: "通用组",
                    undergraduate: "本科组",
                    vocational: "高职高专组",
                    graduate: "研究生组",
                  }[g] || g}
                </option>
              ))}
            </select>
            {group && group !== "all" && (
              <small>具体组别结果同时包含适用于该组的通用组题目。</small>
            )}
          </label>
          {(year || problemType || group || competitionType) && (
            <button
              className="text-button"
              onClick={() => setSp(q ? { q } : {})}
            >
              清除筛选
            </button>
          )}
        </div>
      )}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <Err error={r.error} retry={r.reload} />
      ) : (
        <Rows type={type} items={asItems(r.data)} />
      )}
      {!article && !r.loading && !r.error && (
        <div className="pagination">
          <button
            disabled={page <= 1}
            onClick={() =>
              setSp({ ...Object.fromEntries(sp), page: String(page - 1) })
            }
          >
            上一页
          </button>
          <span>
            第 {page} /{" "}
            {Math.max(
              1,
              Math.ceil((r.data?.total || 0) / (r.data?.pageSize || 24)),
            )}{" "}
            页，共 {r.data?.total || 0} 道
          </span>
          <button
            disabled={
              page >= Math.ceil((r.data?.total || 0) / (r.data?.pageSize || 24))
            }
            onClick={() =>
              setSp({ ...Object.fromEntries(sp), page: String(page + 1) })
            }
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
function FileLink({ f }) {
  const { user } = useSite();
  const loc = useLocation();
  return user ? (
    <a href={f.url || `/api/files/${f.id}`}>
      <Download />
      {f.originalName || f.name}
    </a>
  ) : (
    <Link to={`/auth?next=${encodeURIComponent(loc.pathname)}`}>
      <Download />
      登录后下载 {f.originalName || f.name}
    </Link>
  );
}
function Detail({ type }) {
  const { id } = useParams();
  const r = useLoad(`/${type}/${id}`, [id]);
  if (r.loading) return <Loading />;
  if (r.error)
    return (
      <div className="container page">
        <Err error={r.error} retry={r.reload} />
      </div>
    );
  const x = r.data,
    article = type === "articles";
  return (
    <div className="container reading-page">
      <article className="reading">
        <Link className="back-link" to={`/${type}`}>
          ← 返回列表
        </Link>
        <div className="eyebrow">
          {article
            ? x.category || x.topic
            : { signal: "信号", control: "控制", power: "电源", other: "其他" }[
                x.category || x.type
              ] || "其他"}
        </div>
        <h1>{x.title}</h1>
        <p className="lead">{x.subtitle || x.excerpt || x.intro}</p>
        {!article && (
          <>
            <div className="problem-meta">
              <span>
                竞赛：
                {x.competitionName ||
                  (x.competitionType === "provincial"
                    ? "省赛 TI 杯"
                    : "全国电赛")}
              </span>
              <span>年份：{x.year || "未标注"}</span>
              <span>题号：{x.problemCode || x.letter || "未标注"}</span>
              <span>
                组别：
                {{
                  all: "通用组",
                  undergraduate: "本科组",
                  vocational: "高职高专组",
                }[x.group] ||
                  x.group ||
                  "未标注"}
              </span>
              <span>
                类型：
                {{
                  signal: "信号",
                  control: "控制",
                  power: "电源",
                  other: "其他",
                }[x.category || x.type] ||
                  x.topic ||
                  "其他"}
              </span>
              {(x.sourcePage || x.sourceUrl) && (
                <a
                  href={x.sourcePage || x.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看原始官网来源 <ArrowRight size={15} />
                </a>
              )}
            </div>
            <p className="classification-note">
              “信号、控制、电源、其他”由本站按学习方向整理，可能与官方题目类别不同；题目原文与竞赛归属以官网资料为准。
            </p>
          </>
        )}
        <div className="article-meta">
          <span>{x.author?.nickname || x.author || ""}</span>
          <span>{fmt(x.date || x.createdAt)}</span>
          <Save
            type={article ? "article" : "problem"}
            id={x.id}
            initial={x.bookmarked}
          />
        </div>
        {x.body || x.content || x.description ? (
          <MD>{x.body || x.content || x.description}</MD>
        ) : !article ? (
          <p className="official-body-note">题目原文请下载下方官方 PDF。</p>
        ) : null}
        {!article && x.classificationReason && (
          <details className="classification-reason">
            <summary>查看本站分类依据</summary>
            <p>{x.classificationReason}</p>
          </details>
        )}
        {!article && x.relatedNotices?.length > 0 && (
          <section className="related-notices">
            <h2>相关官方通知</h2>
            {x.relatedNotices.map((notice, i) =>
              typeof notice === "string" ? (
                <p key={i}>{notice}</p>
              ) : (
                <a
                  key={notice.url || i}
                  href={notice.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {notice.title || notice.name || `官方通知 ${i + 1}`}{" "}
                  <ArrowRight size={15} />
                </a>
              ),
            )}
          </section>
        )}
        {x.attachments?.length > 0 && (
          <section className="attachments">
            <h2>附件</h2>
            {x.attachments.map((f) => (
              <FileLink f={f} key={f.id} />
            ))}
          </section>
        )}
        {!article && x.externalFiles?.length > 0 && (
          <section className="attachments external-files">
            <h2>官网原始文件</h2>
            <p className="muted">
              以下文件由原始官网提供，将在新窗口打开，不是本站附件。
            </p>
            {x.externalFiles.map((f, i) => (
              <div
                className="external-file"
                key={`${f.url || f.sourceUrl || "official"}-${i}`}
              >
                <a
                  href={f.url || f.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download />
                  下载官方 H 题附图原包
                </a>
                <span>
                  包含：{f.name || f.originalName || `官网原图 ${i + 1}`}
                  {f.size ? `；原图大小 ${fileSize(f.size)}` : ""}
                </span>
                {f.note && <small>{f.note}</small>}
              </div>
            ))}
          </section>
        )}
        <Comments type={article ? "article" : "problem"} id={x.id} />
      </article>
    </div>
  );
}
function Comments({ type, id }) {
  const { user } = useSite();
  const r = useLoad(`/comments?targetType=${type}&targetId=${id}`, [type, id]);
  const [body, setBody] = useState(""),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/comments", {
        method: "POST",
        body: { targetType: type, targetId: id, body },
      });
      setBody("");
      r.reload();
    } catch (x) {
      setError(x.message);
    }
  }
  async function reply(parentId) {
    const replyBody = prompt("回复内容");
    if (!replyBody?.trim()) return;
    try {
      await api("/comments", {
        method: "POST",
        body: {
          targetType: type,
          targetId: id,
          parentId,
          body: replyBody.trim(),
        },
      });
      r.reload();
    } catch (x) {
      alert(x.message);
    }
  }
  async function report(cid) {
    const reason = prompt("请简要说明举报原因") || "";
    try {
      await api(`/comments/${cid}/report`, {
        method: "POST",
        body: { reason },
      });
      alert("举报已提交审核");
    } catch (x) {
      alert(x.message);
    }
  }
  return (
    <section className="comments">
      <h2>
        <MessageSquare />
        讨论
      </h2>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <Err error={r.error} />
      ) : asItems(r.data).length ? (
        asItems(r.data).map((c) => (
          <article className="comment" key={c.id}>
            <strong>{c.author?.nickname || "用户"}</strong>
            <p>{c.body}</p>
            <small>{fmt(c.createdAt)}</small>
            {user && (
              <>
                <button className="text-button" onClick={() => reply(c.id)}>
                  回复
                </button>
                <button className="text-button" onClick={() => report(c.id)}>
                  举报
                </button>
              </>
            )}
          </article>
        ))
      ) : (
        <p className="muted">还没有评论。</p>
      )}
      {user ? (
        <form onSubmit={submit}>
          <label>
            参与讨论
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </label>
          <Err error={error} />
          <button className="button primary">发表评论</button>
        </form>
      ) : (
        <p>
          <Link to="/auth">登录</Link>后参与讨论。
        </p>
      )}
    </section>
  );
}
function Shops() {
  const [sp, setSp] = useSearchParams(),
    q = sp.get("q") || "";
  const r = useLoad(`/shops?q=${encodeURIComponent(q)}`, [q]);
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="section-kicker">COMMUNITY REVIEWS</span>
        <h1>店铺口碑</h1>
        <p>搜索店铺，查看通过审核的购买体验；历史记录不参与评分。</p>
      </div>
      <SearchBox
        value={q}
        placeholder="输入店铺名称或关键词"
        onSearch={(v) => setSp(v ? { q: v } : {})}
      />
      <div className="action-row">
        <Link className="button secondary" to="/shops/submit">
          <Store />
          提交新店铺
        </Link>
      </div>
      {!q ? (
        <Empty
          title="输入关键词开始搜索"
          text="店铺不会默认罗列，也不会在无匹配时推荐其他店铺。"
        />
      ) : r.loading ? (
        <Loading />
      ) : r.error ? (
        <Err error={r.error} />
      ) : asItems(r.data).length ? (
        <div className="shop-grid">
          {asItems(r.data).map((s) => (
            <Link className="shop-card" to={`/shops/${s.id}`} key={s.id}>
              <span className="eyebrow">{s.platform || "店铺"}</span>
              <h2>{s.name}</h2>
              <p>{s.businessScope || s.condition || ""}</p>
              {s.siteAverage != null && (
                <strong>
                  {Number(s.siteAverage).toFixed(1)} / 5 · {s.siteReviewCount}{" "}
                  条站内评价
                </strong>
              )}
              <div className="sentiment-counts">
                <span>好评 {s.positiveCount || 0}</span>
                <span>中评 {s.neutralCount || 0}</span>
                <span>差评 {s.negativeCount || 0}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="没有匹配的店铺"
          text="可以调整关键词，或提交新店铺等待审核。"
        />
      )}
    </div>
  );
}
function ShopDetail() {
  const [sentiment, setSentiment] = useState("positive");
  const { id } = useParams(),
    r = useLoad(`/shops/${id}`, [id]);
  if (r.loading) return <Loading />;
  if (r.error) return <Err error={r.error} />;
  const s = r.data,
    site = (s.reviews || []).filter((x) => x.rating),
    history = (s.reviews || []).filter((x) => !x.rating),
    sentimentOf = (x) =>
      x.rating
        ? Number(x.rating) >= 4
          ? "positive"
          : Number(x.rating) <= 2
            ? "negative"
            : "neutral"
        : {
            好评: "positive",
            差评: "negative",
            中评: "neutral",
            positive: "positive",
            negative: "negative",
            neutral: "neutral",
          }[x.sentiment] || "neutral",
    shown = [...site, ...history].filter((x) => sentimentOf(x) === sentiment),
    counts = {
      positive:
        s.positiveCount ??
        [...site, ...history].filter((x) => sentimentOf(x) === "positive")
          .length,
      neutral:
        s.neutralCount ??
        [...site, ...history].filter((x) => sentimentOf(x) === "neutral")
          .length,
      negative:
        s.negativeCount ??
        [...site, ...history].filter((x) => sentimentOf(x) === "negative")
          .length,
    };
  return (
    <div className="container reading-page">
      <div className="reading">
        <Link className="back-link" to="/shops">
          ← 返回店铺搜索
        </Link>
        <span className="eyebrow">{s.platform}</span>
        <h1>{s.name}</h1>
        <dl className="shop-facts">
          <div>
            <dt>平台</dt>
            <dd>{s.platform || "未填写"}</dd>
          </div>
          <div>
            <dt>店主标识</dt>
            <dd>{s.ownerId || "未填写"}</dd>
          </div>
          <div>
            <dt>别名</dt>
            <dd>{(s.aliases || []).join("、") || "无"}</dd>
          </div>
          <div>
            <dt>经营状态</dt>
            <dd>{s.condition || "未填写"}</dd>
          </div>
        </dl>
        {s.url && (
          <a
            className="button secondary shop-external"
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            访问店铺 <ArrowRight size={16} />
          </a>
        )}
        <p>{s.businessScope}</p>
        <div className="sentiment-counts">
          <strong>已审核评价</strong>
          {[
            ["positive", "好评"],
            ["neutral", "中评"],
            ["negative", "差评"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={sentiment === key ? "selected" : ""}
              onClick={() => setSentiment(key)}
            >
              {label} {counts[key]}
            </button>
          ))}
        </div>
        <h2>已审核评价</h2>
        <p className="muted">历史个人意见仅供参考，不计入站内星级评分。</p>
        {shown.length ? (
          shown.map((x) => (
            <article
              className={`review ${x.rating ? "" : "history"}`}
              key={x.id}
            >
              <strong>
                {x.rating
                  ? `${x.rating} / 5`
                  : {
                      positive: "好评",
                      neutral: "中评",
                      negative: "差评",
                      好评: "好评",
                      中评: "中评",
                      差评: "差评",
                    }[x.sentiment] || "中评"}
              </strong>
              {x.rating && (
                <>
                  <p>
                    <b>优点：</b>
                    {x.pros || "未填写"}
                  </p>
                  <p>
                    <b>不足：</b>
                    {x.cons || "未填写"}
                  </p>
                  <p>{x.purchaseExperience}</p>
                </>
              )}
              {x.reason && (
                <p>
                  <b>理由：</b>
                  {x.reason}
                </p>
              )}
              {x.notes && (
                <p>
                  <b>备注：</b>
                  {x.notes}
                </p>
              )}
              {x.supplements && (
                <p>
                  <b>补充：</b>
                  {x.supplements}
                </p>
              )}
              {x.questions && (
                <p>
                  <b>疑问：</b>
                  {x.questions}
                </p>
              )}
              <small>{x.date}</small>
            </article>
          ))
        ) : (
          <Empty
            title={`还没有${{ positive: "好评", neutral: "中评", negative: "差评" }[sentiment]}`}
          />
        )}
        <ReviewForm id={id} reload={r.reload} />
      </div>
    </div>
  );
}
function ReviewForm({ id, reload }) {
  const { user } = useSite();
  const [f, setF] = useState({
      rating: 5,
      pros: "",
      cons: "",
      purchaseExperience: "",
      purchasedAt: "",
      orderPlatform: "",
    }),
    [proof, setProof] = useState(),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  if (!user)
    return (
      <p>
        <Link to="/auth">登录</Link>后提交评价。
      </p>
    );
  async function submit(e) {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (proof) fd.append("proof", proof);
    try {
      await api(`/shops/${id}/reviews`, { method: "POST", body: fd });
      setDone(true);
      reload();
    } catch (x) {
      setError(x.message);
    }
  }
  return (
    <section className="form-section">
      <h2>提交购买评价</h2>
      <p className="muted">审核通过后公开并计入评分。</p>
      {done ? (
        <div className="success-box">
          <Check />
          已提交审核。
        </div>
      ) : (
        <form className="form-grid" onSubmit={submit}>
          {[
            ["rating", "评分", "number"],
            ["purchasedAt", "购买日期", "date"],
            ["orderPlatform", "订单平台", "text"],
            ["pros", "优点", "textarea"],
            ["cons", "不足", "textarea"],
            ["purchaseExperience", "购买体验", "textarea"],
          ].map(([k, l, t]) => (
            <label key={k}>
              {l}
              {t === "textarea" ? (
                <textarea
                  value={f[k]}
                  onChange={(e) => setF({ ...f, [k]: e.target.value })}
                />
              ) : (
                <input
                  type={t}
                  min="1"
                  max="5"
                  value={f[k]}
                  onChange={(e) => setF({ ...f, [k]: e.target.value })}
                />
              )}
            </label>
          ))}
          <label>
            购买凭证（可选）
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setProof(e.target.files[0])}
            />
          </label>
          <Err error={error} />
          <button className="button primary">提交审核</button>
        </form>
      )}
    </section>
  );
}
function ShopSubmit() {
  const { user } = useSite();
  const [f, setF] = useState({
      name: "",
      aliases: "",
      ownerId: "",
      platform: "",
      url: "",
      condition: "",
      businessScope: "",
    }),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  if (!user) return <Navigate to="/auth" />;
  async function submit(e) {
    e.preventDefault();
    try {
      await api("/shops", {
        method: "POST",
        body: {
          ...f,
          aliases: f.aliases
            .split(/[，,]/)
            .map((x) => x.trim())
            .filter(Boolean),
        },
      });
      setDone(true);
    } catch (x) {
      setError(x.message);
    }
  }
  return (
    <div className="container narrow page">
      <div className="page-heading">
        <h1>提交新店铺</h1>
        <p>信息将在管理员审核后公开。</p>
      </div>
      {done ? (
        <div className="success-box">
          <Check />
          已提交审核。
        </div>
      ) : (
        <form className="panel form-stack" onSubmit={submit}>
          {Object.keys(f).map((k) => (
            <label key={k}>
              {
                {
                  name: "店铺名称",
                  aliases: "别名（逗号分隔）",
                  ownerId: "店主标识",
                  platform: "所在平台",
                  url: "店铺链接",
                  condition: "经营状态",
                  businessScope: "经营范围",
                }[k]
              }
              <input
                type={k === "url" ? "url" : "text"}
                value={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
                required={k === "name"}
              />
            </label>
          ))}
          <Err error={error} />
          <button className="button primary">提交审核</button>
        </form>
      )}
    </div>
  );
}
function Auth() {
  const { user, config, refresh } = useSite();
  const [mode, setMode] = useState("login"),
    [f, setF] = useState({
      email: "",
      password: "",
      nickname: "",
      code: "",
      newPassword: "",
    }),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const nav = useNavigate(),
    [sp] = useSearchParams();
  if (user) return <Navigate to={sp.get("next") || "/account"} />;
  async function code() {
    try {
      await api("/auth/request-code", {
        method: "POST",
        body: {
          email: f.email,
          purpose: mode === "reset" ? "reset" : "register",
        },
      });
      setSent(true);
    } catch (x) {
      setError(x.message);
    }
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "login")
        await api("/auth/login", {
          method: "POST",
          body: { email: f.email, password: f.password },
        });
      else if (mode === "register")
        await api("/auth/register", {
          method: "POST",
          body: {
            email: f.email,
            code: f.code,
            password: f.password,
            nickname: f.nickname,
          },
        });
      else
        await api("/auth/reset-password", {
          method: "POST",
          body: { email: f.email, code: f.code, newPassword: f.newPassword },
        });
      if (mode === "reset") {
        setMode("login");
        setSent(false);
      } else {
        await refresh();
        nav(sp.get("next") || "/account");
      }
    } catch (x) {
      setError(x.message);
    }
  }
  return (
    <div className="container auth-page">
      <div className="auth-photo">
        <Photo id="pcb" />
        <PhotoCredit id="pcb" />
      </div>
      <div className="auth-card">
        <h1>
          {mode === "login"
            ? "登录电子煎饼"
            : mode === "register"
              ? "创建账号"
              : "找回密码"}
        </h1>
        <div className="tabs">
          <button onClick={() => setMode("login")}>登录</button>
          <button
            disabled={!config.registrationEnabled}
            onClick={() => setMode("register")}
          >
            注册
          </button>
          <button
            disabled={!config.registrationEnabled}
            onClick={() => setMode("reset")}
          >
            忘记密码
          </button>
        </div>
        {!config.registrationEnabled && (
          <p className="notice">注册与找回密码暂未开放。</p>
        )}
        <form className="form-stack" onSubmit={submit}>
          <label>
            邮箱
            <input
              type="email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              required
            />
          </label>
          {mode === "register" && (
            <label>
              昵称
              <input
                value={f.nickname}
                onChange={(e) => setF({ ...f, nickname: e.target.value })}
                required
              />
            </label>
          )}
          {mode !== "login" && (
            <label>
              邮箱验证码
              <div className="field-action">
                <input
                  value={f.code}
                  onChange={(e) => setF({ ...f, code: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="button secondary"
                  onClick={code}
                  disabled={!f.email}
                >
                  {sent ? "重新发送" : "发送验证码"}
                </button>
              </div>
            </label>
          )}
          <label>
            {mode === "reset" ? "新密码" : "密码"}
            <input
              type="password"
              minLength={mode === "login" ? undefined : 10}
              value={mode === "reset" ? f.newPassword : f.password}
              onChange={(e) =>
                setF({
                  ...f,
                  [mode === "reset" ? "newPassword" : "password"]:
                    e.target.value,
                })
              }
              required
            />
          </label>
          <Err error={error} />
          <button className="button primary full">
            {mode === "login"
              ? "登录"
              : mode === "register"
                ? "注册"
                : "重置密码"}
          </button>
        </form>
      </div>
    </div>
  );
}
function Write() {
  const { user, config } = useSite();
  const [sp] = useSearchParams(),
    [f, setF] = useState({
      title: "",
      category: topics[0].name,
      tags: "",
      excerpt: "",
      body: starterMarkdown,
    }),
    [id, setId] = useState(sp.get("draft")),
    [files, setFiles] = useState([]),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    if (id)
      api(`/articles/drafts/${id}`)
        .then((d) => setF({ ...d, tags: (d.tags || []).join(",") }))
        .catch(() => {});
  }, []);
  if (!user) return <Navigate to="/auth" />;
  async function save(submit) {
    setError("");
    setSaved("");
    try {
      const body = {
        ...f,
        tags: f.tags
          .split(/[，,]/)
          .map((x) => x.trim())
          .filter(Boolean),
      };
      const r = await api(id ? `/articles/drafts/${id}` : "/articles/drafts", {
        method: id ? "PATCH" : "POST",
        body,
      });
      const did = r.id || r.draft?.id || id;
      setId(did);
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        await api(`/articles/drafts/${did}/attachments`, {
          method: "POST",
          body: fd,
        });
      }
      setFiles([]);
      setSaved("草稿和附件已保存");
      if (submit) {
        await api(`/articles/drafts/${did}/submit`, { method: "POST" });
        nav("/account?tab=submissions");
      }
    } catch (x) {
      setError(x.message);
    }
  }
  return (
    <div className="container editor-page">
      <div className="editor-head">
        <div>
          <h1>写文章</h1>
          <p>Markdown 草稿可反复保存，提交后进入审核。</p>
        </div>
        <div>
          <button className="button secondary" onClick={() => save(false)}>
            保存草稿
          </button>
          <button className="button primary" onClick={() => save(true)}>
            提交审核
          </button>
        </div>
      </div>
      <Err error={error} />
      {saved && (
        <div className="success-box">
          <Check />
          {saved}
        </div>
      )}
      <div className="editor-meta">
        {[
          ["title", "标题"],
          ["tags", "标签（逗号分隔）"],
          ["excerpt", "摘要"],
        ].map(([k, l]) => (
          <label key={k}>
            {l}
            <input
              value={f[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
            />
          </label>
        ))}
        <label>
          分类
          <select
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value })}
          >
            {topics.map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </select>
        </label>
        <label>
          附件（单个不超过{" "}
          {Math.round((config.maxUploadBytes || 52428800) / 1048576)} MiB）
          <input
            type="file"
            multiple
            onChange={(e) => setFiles([...e.target.files])}
          />
        </label>
      </div>
      <div className="editor-split">
        <label>
          Markdown
          <textarea
            className="editor-textarea"
            value={f.body}
            onChange={(e) => setF({ ...f, body: e.target.value })}
          />
        </label>
        <section className="preview">
          <h2>{f.title || "文章预览"}</h2>
          <MD>{f.body}</MD>
        </section>
      </div>
    </div>
  );
}
function Account() {
  const { user, refresh } = useSite();
  const [sp, setSp] = useSearchParams(),
    tab = sp.get("tab") || "profile";
  if (!user) return <Navigate to="/auth" />;
  return (
    <div className="container workspace">
      <aside>
        <div className="profile-chip">
          <span className="avatar">{user.nickname?.[0]}</span>
          <strong>{user.role === "owner" ? "Admin" : user.nickname}</strong>
          <small>{user.email}</small>
        </div>
        {[
          ["profile", "资料"],
          ["submissions", "投稿"],
          ["drafts", "草稿"],
          ["reviews", "评价"],
          ["shops", "店铺"],
          ["bookmarks", "收藏"],
          ["notifications", "通知"],
        ].map(([k, l]) => (
          <button
            className={tab === k ? "active" : ""}
            key={k}
            onClick={() => setSp({ tab: k })}
          >
            {l}
          </button>
        ))}
        {(permit(user, "content") ||
          permit(user, "shop_reviews") ||
          permit(user, "reports")) && (
          <Link className="admin-link" to="/admin">
            <ShieldCheck />
            管理工作台
          </Link>
        )}
      </aside>
      <section className="workspace-main">
        {tab === "profile" ? (
          <Profile user={user} refresh={refresh} />
        ) : (
          <Mine tab={tab} />
        )}
      </section>
    </div>
  );
}
function Profile({ user, refresh }) {
  const [nickname, setNickname] = useState(user.nickname),
    [pw, setPw] = useState({ currentPassword: "", newPassword: "" }),
    [status, setStatus] = useState("");
  async function update(e) {
    e.preventDefault();
    try {
      await api("/me", { method: "PATCH", body: { nickname } });
      await refresh();
      setStatus("资料已保存");
    } catch (x) {
      setStatus(x.message);
    }
  }
  async function password(e) {
    e.preventDefault();
    try {
      await api("/auth/change-password", { method: "POST", body: pw });
      await refresh();
      setStatus("密码已更新，请重新登录");
    } catch (x) {
      setStatus(x.message);
    }
  }
  return (
    <>
      <h1>个人资料</h1>
      <form className="panel form-stack" onSubmit={update}>
        <label>
          昵称
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <label>
          邮箱
          <input value={user.email} disabled />
        </label>
        <button className="button primary">保存资料</button>
      </form>
      <h2>修改密码</h2>
      <form className="panel form-stack" onSubmit={password}>
        <label>
          当前密码
          <input
            type="password"
            value={pw.currentPassword}
            onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
          />
        </label>
        <label>
          新密码
          <input
            type="password"
            minLength="10"
            value={pw.newPassword}
            onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
          />
        </label>
        <button className="button secondary">修改密码</button>
      </form>
      <p>{status}</p>
    </>
  );
}
function Mine({ tab }) {
  const r = useLoad(`/me/${tab}`, [tab]);
  async function markRead() {
    try {
      await api("/me/notifications/read", {
        method: "POST",
        body: {
          ids: asItems(r.data)
            .filter((x) => !x.read)
            .map((x) => x.id),
        },
      });
      r.reload();
    } catch (x) {
      alert(x.message);
    }
  }
  return (
    <>
      <h1>
        {
          {
            submissions: "我的投稿",
            drafts: "草稿",
            reviews: "我的评价",
            bookmarks: "我的收藏",
            notifications: "站内通知",
          }[tab]
        }
      </h1>
      {tab === "notifications" && asItems(r.data).some((x) => !x.read) && (
        <button className="button secondary small" onClick={markRead}>
          全部标为已读
        </button>
      )}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <Err error={r.error} />
      ) : asItems(r.data).length ? (
        <div className="record-list">
          {asItems(r.data).map((x, i) => (
            <article key={x.id || i}>
              <strong>
                {x.title || x.name || x.message || x.body || "记录"}
              </strong>
              <p>{x.excerpt || x.reason || ""}</p>
              <span className={`status status-${x.status}`}>
                {x.status || fmt(x.createdAt)}
              </span>
              {tab === "drafts" && (
                <Link to={`/write?draft=${x.id}`}>继续编辑</Link>
              )}
              {tab === "shops" && <Link to={`/shops/${x.id}`}>查看店铺</Link>}
              {tab === "bookmarks" && (
                <Link
                  to={`/${x.type === "shop" ? "shops" : `${x.type}s`}/${x.targetId || x.id}`}
                >
                  查看收藏
                </Link>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </>
  );
}
function Admin() {
  const { user } = useSite();
  const opts = [
    ...(permit(user, "content")
      ? [
          ["articles", "文章"],
          ["problems", "赛题"],
        ]
      : []),
    ...(permit(user, "shop_reviews")
      ? [
          ["shops", "店铺"],
          ["reviews", "评价"],
        ]
      : []),
    ...(permit(user, "reports") ? [["reports", "举报"]] : []),
    ...(user?.role === "owner"
      ? [
          ["accounts", "账号"],
          ["audit", "审计"],
        ]
      : []),
  ];
  const [type, setType] = useState(opts[0]?.[0]);
  if (!user) return <Navigate to="/auth" />;
  if (!opts.length) return <Navigate to="/account" />;
  return (
    <div className="container workspace">
      <aside>
        <h2>管理工作台</h2>
        {opts.map(([k, l]) => (
          <button
            className={type === k ? "active" : ""}
            onClick={() => setType(k)}
            key={k}
          >
            {l}
          </button>
        ))}
      </aside>
      <section className="workspace-main">
        {type === "accounts" ? (
          <Accounts />
        ) : type === "audit" ? (
          <Records />
        ) : type === "problems" ? (
          <ProblemCreate />
        ) : (
          <Moderation type={type} />
        )}
      </section>
    </div>
  );
}
function Moderation({ type }) {
  const [status, setStatus] = useState("pending");
  const r = useLoad(`/admin/queue?type=${type}&status=${status}`, [
    type,
    status,
  ]);
  async function decide(id, decision) {
    const reason =
      decision === "approved" || decision === "dismissed"
        ? ""
        : prompt("请填写原因") || "";
    try {
      await api(`/admin/${type}/${id}/decision`, {
        method: "POST",
        body: { decision, reason },
      });
      r.reload();
    } catch (x) {
      alert(x.message);
    }
  }
  return (
    <>
      <h1>
        审核 ·{" "}
        {
          { articles: "文章", shops: "店铺", reviews: "评价", reports: "举报" }[
            type
          ]
        }
      </h1>
      <div className="chips">
        {["pending", "approved", "rejected", "hidden", "all"].map((s) => (
          <button
            key={s}
            className={status === s ? "selected" : ""}
            onClick={() => setStatus(s)}
          >
            {
              {
                pending: "待审",
                approved: "已通过",
                rejected: "已拒绝",
                hidden: "已下架",
                all: "全部",
              }[s]
            }
          </button>
        ))}
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <Err error={r.error} />
      ) : asItems(r.data).length ? (
        <div className="record-list">
          {asItems(r.data).map((x) => (
            <article key={x.id}>
              <strong>
                {x.title || x.name || x.body || x.reason || `#${x.id}`}
              </strong>
              <p>{x.excerpt || x.description || ""}</p>
              {x.body && <MD>{x.body}</MD>}
              {type === "articles" && x.attachments?.length > 0 && (
                <div className="attachments">
                  <strong>投稿附件</strong>
                  {x.attachments.map((f) => (
                    <FileLink key={f.id} f={f} />
                  ))}
                </div>
              )}
              {type === "reviews" && (
                <div>
                  <p>
                    <b>店铺：</b>
                    {x.shopName || x.shop?.name || x.shopId || "未填写"}
                  </p>
                  <p>
                    <b>评分：</b>
                    {x.rating
                      ? `${x.rating} / 5`
                      : { positive: "好评", neutral: "中评", negative: "差评" }[
                          x.sentiment
                        ] ||
                        x.sentiment ||
                        "未填写"}
                  </p>
                  <p>
                    <b>优点：</b>
                    {x.pros || "未填写"}
                  </p>
                  <p>
                    <b>不足：</b>
                    {x.cons || "未填写"}
                  </p>
                  <p>
                    <b>购买经历：</b>
                    {x.purchaseExperience || "未填写"}
                  </p>
                  <p>
                    <b>购买信息：</b>
                    {x.purchasedAt || "日期未填"} ·{" "}
                    {x.orderPlatform || "平台未填"}
                  </p>
                  {x.reason && (
                    <p>
                      <b>历史理由：</b>
                      {x.reason}
                    </p>
                  )}
                  {x.notes && (
                    <p>
                      <b>历史备注：</b>
                      {x.notes}
                    </p>
                  )}
                  {x.supplements && (
                    <p>
                      <b>历史补充：</b>
                      {x.supplements}
                    </p>
                  )}
                  {x.questions && (
                    <p>
                      <b>历史疑问：</b>
                      {x.questions}
                    </p>
                  )}
                  {x.proofFileId && (
                    <FileLink
                      f={{ id: x.proofFileId, name: "查看私有购买凭证" }}
                    />
                  )}
                </div>
              )}
              {type === "shops" && (
                <div>
                  <p>平台：{x.platform || "未填写"}</p>
                  <p>店主标识：{x.ownerId || x.owner_ref || "未填写"}</p>
                  <p>经营状态：{x.condition || x.condition_text || "未填写"}</p>
                  <p>
                    经营范围：{x.businessScope || x.business_scope || "未填写"}
                  </p>
                  <p>链接：{x.url || "未填写"}</p>
                </div>
              )}
              {type === "reports" && (
                <div>
                  <p>
                    <b>举报理由：</b>
                    {x.reason || "未填写"}
                  </p>
                  <p>
                    <b>评论作者：</b>
                    {x.commentAuthor?.nickname || x.commentAuthor || "未知"}
                  </p>
                  <p>
                    <b>被举报评论：</b>
                    {x.commentBody || x.comment?.body || "无法获取评论上下文"}
                  </p>
                </div>
              )}
              <button
                className="button primary small"
                onClick={() =>
                  decide(x.id, type === "reports" ? "dismissed" : "approved")
                }
              >
                {type === "reports" ? "驳回举报" : "通过"}
              </button>
              <button
                className="button secondary small"
                onClick={() =>
                  decide(x.id, type === "reports" ? "removed" : "rejected")
                }
              >
                {type === "reports" ? "移除内容" : "拒绝"}
              </button>
              {type !== "reports" && status !== "hidden" && (
                <button
                  className="button secondary small"
                  onClick={() => decide(x.id, "hidden")}
                >
                  下架
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty title="当前筛选暂无记录" text="切换审核状态后可查看其他记录。" />
      )}
    </>
  );
}
function Accounts() {
  const [query, setQuery] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const r = useLoad(
    `/admin/accounts?q=${encodeURIComponent(submitted)}&page=${page}&pageSize=20`,
    [submitted, page],
  );
  const total = r.data?.total || 0,
    pageSize = r.data?.pageSize || 20,
    pages = Math.max(1, Math.ceil(total / pageSize));
  function choose(user) {
    setSelected({ ...user, permissions: [...(user.permissions || [])] });
    setMessage("");
    setError("");
  }
  async function save(body) {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/admin/accounts/${selected.id}`, { method: "PATCH", body });
      setMessage(`已更新 ${selected.nickname}（${selected.email}）`);
      setSelected(null);
      r.reload();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>用户与管理员</h1>
      <p>
        从已验证邮箱用户中选择管理员并分配职责。任何变更都会让该用户的现有登录失效。
      </p>
      <form
        className="account-search"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSubmitted(query.trim());
        }}
      >
        <label>
          搜索用户
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="邮箱或昵称"
          />
        </label>
        <button className="button primary">搜索</button>
      </form>
      <Err error={r.error || error} retry={r.error ? r.reload : undefined} />
      {message && (
        <div className="success-box">
          <Check />
          {message}
        </div>
      )}
      {r.loading ? (
        <Loading />
      ) : (
        <div className="record-list">
          {asItems(r.data).map((a) => (
            <article key={a.id}>
              <div className="account-row">
                <div>
                  <strong>{a.role === "owner" ? "Admin" : a.nickname}</strong>
                  <p>{a.email}</p>
                </div>
                <div className="account-badges">
                  <span>
                    {a.role === "owner"
                      ? "最高管理员"
                      : a.role === "admin"
                        ? "下级管理员"
                        : "普通用户"}
                  </span>
                  <span>{a.emailVerified ? "邮箱已验证" : "邮箱未验证"}</span>
                  <span>{a.enabled ? "已启用" : "已停用"}</span>
                </div>
                {a.role !== "owner" && (
                  <button
                    className="button secondary small"
                    onClick={() => choose(a)}
                  >
                    管理此用户
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {!r.loading && !asItems(r.data).length && (
        <Empty title="没有匹配的用户" text="尝试邮箱或昵称中的其他关键词。" />
      )}
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>
          上一页
        </button>
        <span>
          第 {page} / {pages} 页，共 {total} 位用户
        </span>
        <button disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>
          下一页
        </button>
      </div>
      {selected && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setSelected(null);
          }}
        >
          <section
            className="account-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-dialog-title"
          >
            <h2 id="account-dialog-title">确认管理目标</h2>
            <div className="target-user">
              <strong>{selected.nickname}</strong>
              <span>{selected.email}</span>
              <small>
                {selected.emailVerified ? "邮箱已验证" : "邮箱未验证"}
              </small>
            </div>
            <label>
              角色
              <select
                value={selected.role}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    role: e.target.value,
                    permissions:
                      e.target.value === "member" ? [] : selected.permissions,
                  })
                }
              >
                <option value="member">普通用户</option>
                <option value="admin" disabled={!selected.emailVerified}>
                  下级管理员
                </option>
              </select>
            </label>
            {selected.role === "admin" && (
              <fieldset>
                <legend>分工授权</legend>
                {[
                  ["content", "文章与赛题"],
                  ["shop_reviews", "店铺与评价"],
                  ["reports", "举报处理"],
                ].map(([p, l]) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={selected.permissions.includes(p)}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          permissions: e.target.checked
                            ? [...selected.permissions, p]
                            : selected.permissions.filter((x) => x !== p),
                        })
                      }
                    />
                    {l}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="dialog-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                取消
              </button>
              <button
                className="button primary"
                disabled={
                  busy || (selected.role === "admin" && !selected.emailVerified)
                }
                onClick={() =>
                  save({
                    role: selected.role,
                    permissions: selected.permissions,
                    enabled: selected.enabled,
                  })
                }
              >
                {busy ? "正在保存…" : "确认角色与权限"}
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => save({ enabled: !selected.enabled })}
              >
                {selected.enabled ? "停用此用户" : "启用此用户"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function Records() {
  const r = useLoad("/admin/audit", []);
  return (
    <>
      <h1>审计日志</h1>
      {r.loading ? (
        <Loading />
      ) : (
        <div className="record-list">
          {asItems(r.data).map((x) => (
            <article key={x.id}>
              <strong>{x.action}</strong>
              <p>{x.detail}</p>
              <small>{fmt(x.createdAt)}</small>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function ProblemCreate() {
  const blank = {
    title: "",
    year: new Date().getFullYear(),
    category: "signal",
    competitionType: "national",
    competitionName: "全国大学生电子设计竞赛",
    group: "undergraduate",
    problemCode: "",
    letter: "",
    body: "",
    sourcePage: "",
    sourceUrl: "",
    status: "published",
  };
  const [query, setQuery] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [filter, setFilter] = useState("all"),
    [competitionFilter, setCompetitionFilter] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState(null),
    [attachment, setAttachment] = useState(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const r = useLoad(
    `/admin/problems?q=${encodeURIComponent(submitted)}&status=${filter}&competitionType=${competitionFilter}&page=${page}&pageSize=20`,
    [submitted, filter, competitionFilter, page],
  );
  const total = r.data?.total || 0,
    pages = Math.max(1, Math.ceil(total / (r.data?.pageSize || 20)));
  function open(item) {
    setEditing(item ? { ...blank, ...item } : { ...blank });
    setAttachment(undefined);
    setError("");
    setMessage("");
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const method = editing.id ? "PATCH" : "POST",
        path = editing.id ? `/admin/problems/${editing.id}` : "/admin/problems";
      const result = await api(path, { method, body: editing });
      if (attachment) {
        const fd = new FormData();
        fd.append("file", attachment);
        await api(`/admin/problems/${result.id || editing.id}/attachments`, {
          method: "POST",
          body: fd,
        });
      }
      setMessage(editing.id ? "赛题信息已更新" : "赛题已创建");
      setEditing(null);
      r.reload();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(item) {
    const next = item.status === "published" ? "hidden" : "published";
    if (!confirm(`确认${next === "hidden" ? "下架" : "发布"}“${item.title}”？`))
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/problems/${item.id}`, {
        method: "PATCH",
        body: { status: next },
      });
      setMessage(`已${next === "hidden" ? "下架" : "发布"}：${item.title}`);
      r.reload();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-title-row">
        <div>
          <h1>赛题管理</h1>
          <p>维护全国电赛与省赛 TI 杯题目、分类和公开状态。</p>
        </div>
        <button className="button primary" onClick={() => open(null)}>
          新增赛题
        </button>
      </div>
      <form
        className="account-search"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSubmitted(query.trim());
        }}
      >
        <label>
          检索赛题
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="标题、题号或关键词"
          />
        </label>
        <label>
          竞赛
          <select
            value={competitionFilter}
            onChange={(e) => {
              setPage(1);
              setCompetitionFilter(e.target.value);
            }}
          >
            <option value="">全部竞赛</option>
            <option value="national">全国电赛</option>
            <option value="provincial">省赛 TI 杯</option>
          </select>
        </label>
        <label>
          状态
          <select
            value={filter}
            onChange={(e) => {
              setPage(1);
              setFilter(e.target.value);
            }}
          >
            <option value="all">全部</option>
            <option value="published">已发布</option>
            <option value="hidden">已下架</option>
          </select>
        </label>
        <button className="button primary">检索</button>
      </form>
      <Err error={r.error || error} retry={r.error ? r.reload : undefined} />
      {message && (
        <div className="success-box">
          <Check />
          {message}
        </div>
      )}
      {r.loading ? (
        <Loading />
      ) : asItems(r.data).length ? (
        <div className="record-list">
          {asItems(r.data).map((item) => (
            <article key={item.id}>
              <div className="problem-admin-row">
                <div>
                  <strong>
                    {item.year} {item.problemCode || item.letter} · {item.title}
                  </strong>
                  <p>
                    {item.competitionName ||
                      (item.competitionType === "provincial"
                        ? "省赛 TI 杯"
                        : "全国电赛")}{" "}
                    ·{" "}
                    {{
                      signal: "信号",
                      control: "控制",
                      power: "电源",
                      other: "其他",
                    }[item.category] || item.category}{" "}
                    ·{" "}
                    {{
                      all: "通用组",
                      undergraduate: "本科组",
                      vocational: "高职高专组",
                    }[item.group] ||
                      item.group ||
                      "未分组"}
                  </p>
                </div>
                <span className={`status status-${item.status}`}>
                  {item.status === "published" ? "已发布" : "已下架"}
                </span>
                <div>
                  <button
                    className="button secondary small"
                    onClick={() => open(item)}
                  >
                    编辑
                  </button>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => toggle(item)}
                  >
                    {item.status === "published" ? "下架" : "发布"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="没有匹配的赛题" text="调整关键词或状态筛选后重试。" />
      )}
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>
          上一页
        </button>
        <span>
          第 {page} / {pages} 页，共 {total} 道
        </span>
        <button disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>
          下一页
        </button>
      </div>
      {editing && (
        <div className="modal-backdrop">
          <form
            className="account-dialog problem-dialog"
            role="dialog"
            aria-modal="true"
            onSubmit={save}
          >
            <h2>{editing.id ? "编辑赛题" : "新增赛题"}</h2>
            <div className="form-grid">
              {[
                ["title", "标题", "text"],
                ["year", "年份", "number"],
                ["problemCode", "题号", "text"],
                ["letter", "字母题号", "text"],
                ["sourcePage", "官网页码/来源说明", "text"],
              ].map(([k, l, t]) => (
                <label key={k}>
                  {l}
                  <input
                    type={t}
                    min={k === "year" ? 2017 : undefined}
                    value={editing[k] || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, [k]: e.target.value })
                    }
                    required={k === "title" || k === "year"}
                  />
                </label>
              ))}
              <label>
                竞赛
                <select
                  value={editing.competitionType}
                  onChange={(e) => {
                    const competitionType = e.target.value;
                    setEditing({
                      ...editing,
                      competitionType,
                      competitionName:
                        competitionType === "national"
                          ? "全国大学生电子设计竞赛"
                          : "陕西省大学生电子设计竞赛（TI杯）",
                    });
                  }}
                  required
                >
                  <option value="national">全国电赛</option>
                  <option value="provincial">省赛 TI 杯</option>
                </select>
              </label>
              <label>
                组别
                <select
                  value={editing.group}
                  onChange={(e) =>
                    setEditing({ ...editing, group: e.target.value })
                  }
                >
                  <option value="undergraduate">本科组</option>
                  <option value="vocational">高职高专组</option>
                  <option value="all">通用组</option>
                </select>
              </label>
              <label>
                竞赛全称
                <input
                  value={editing.competitionName || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, competitionName: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                类型
                <select
                  value={editing.category}
                  onChange={(e) =>
                    setEditing({ ...editing, category: e.target.value })
                  }
                >
                  <option value="signal">信号</option>
                  <option value="control">控制</option>
                  <option value="power">电源</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label>
                原始官网链接
                <input
                  type="url"
                  value={editing.sourceUrl || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, sourceUrl: e.target.value })
                  }
                />
              </label>
              <label className="span-2">
                说明
                <textarea
                  value={editing.body || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, body: e.target.value })
                  }
                />
              </label>
              <label className="span-2">
                新增附件
                <input
                  type="file"
                  onChange={(e) => setAttachment(e.target.files[0])}
                />
              </label>
            </div>
            <Err error={error} />
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "正在保存…" : "保存赛题"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
function SearchPage() {
  const [sp] = useSearchParams(),
    q = sp.get("q") || "";
  const a = useLoad(`/articles?q=${encodeURIComponent(q)}`, [q]),
    p = useLoad(`/problems?q=${encodeURIComponent(q)}`, [q]),
    s = useLoad(`/shops?q=${encodeURIComponent(q)}`, [q]);
  return (
    <div className="container page">
      <div className="page-heading">
        <h1>搜索</h1>
        <p>{q ? `“${q}”的搜索结果` : "输入关键词查找内容"}</p>
      </div>
      <SearchBox value={q} />
      {q && (
        <>
          <h2>文章</h2>
          {a.loading ? (
            <Loading />
          ) : (
            <Rows type="articles" items={asItems(a.data)} />
          )}
          <h2>赛题</h2>
          {p.loading ? (
            <Loading />
          ) : (
            <Rows type="problems" items={asItems(p.data)} />
          )}
          <h2>店铺</h2>
          {s.loading ? (
            <Loading />
          ) : asItems(s.data).length ? (
            <div className="shop-grid">
              {asItems(s.data).map((x) => (
                <Link className="shop-card" to={`/shops/${x.id}`} key={x.id}>
                  <h3>{x.name}</h3>
                  <p>{x.businessScope}</p>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="没有匹配的店铺" text="全站搜索不会推荐无关店铺。" />
          )}
        </>
      )}
    </div>
  );
}
function Topics() {
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="section-kicker">LEARNING PATHS</span>
        <h1>学习专题</h1>
        <p>按方向查找已审核文章，建立自己的知识路径。</p>
      </div>
      <div className="topic-grid">
        {topics.map((t) => (
          <Link
            className="topic-card"
            to={`/articles?category=${encodeURIComponent(t.name)}`}
            key={t.name}
          >
            <h2>{t.name}</h2>
            <p>{t.desc}</p>
            <span>
              查看相关文章 <ArrowRight size={16} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
function About() {
  return (
    <div className="container reading-page">
      <article className="reading">
        <h1>关于电子煎饼</h1>
        <p className="lead">
          面向电子设计学习者的赛题、实践文章与真实购买经验社区。
        </p>
        <p>
          文章、店铺和评价均在审核通过后公开。店铺历史记录用于呈现事实变更，不参与评分。
        </p>
        <PhotoCredits />
      </article>
    </div>
  );
}
function RoutesView() {
  const { ready } = useSite();
  if (!ready) return <Loading />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/problems" element={<Listing type="problems" />} />
        <Route path="/problems/:id" element={<Detail type="problems" />} />
        <Route path="/articles" element={<Listing type="articles" />} />
        <Route path="/articles/:id" element={<Detail type="articles" />} />
        <Route path="/topics" element={<Topics />} />
        <Route path="/shops" element={<Shops />} />
        <Route path="/shops/submit" element={<ShopSubmit />} />
        <Route path="/shops/:id" element={<ShopDetail />} />
        <Route path="/write" element={<Write />} />
        <Route path="/account" element={<Account />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/about" element={<About />} />
        <Route
          path="*"
          element={
            <div className="container page">
              <Empty title="页面不存在">
                <Link className="button primary" to="/">
                  返回首页
                </Link>
              </Empty>
            </div>
          }
        />
      </Routes>
    </Layout>
  );
}
export default function App() {
  return (
    <Provider>
      <RoutesView />
    </Provider>
  );
}
