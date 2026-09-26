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
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  LogOut,
  Menu,
  Megaphone,
  MessageSquare,
  PenLine,
  Search,
  ShieldCheck,
  Store,
  Image,
  Link2,
  LayoutGrid,
  List,
  X,
} from "lucide-react";
import { Provider, api, asItems, useSite } from "./store";
import { topics, starterMarkdown } from "./data";
import { Photo, PhotoCredit, PhotoCredits } from "./Photos";
const Markdown = lazy(() => import("./Markdown"));
const fmt = (v) => (v ? new Date(v).toLocaleDateString("zh-CN") : "");
const storedArticleLayout = () => { try { const value = localStorage.getItem("article-layout"); return value === "cards" ? "cards" : "list"; } catch { return "list"; } };
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
const permit = (u, p) => u?.role === "owner" || u?.role === "admin" || u?.permissions?.includes(p);
const downloadableFiles = (files = []) => files.filter((f) => !f.publicImage && !f.isCover && f.kind !== "article-image" && f.kind !== "cover");
const statusLabel = (status) => ({ approved: "已通过", pending: "待审核", draft: "草稿", hidden: "已下架", rejected: "已退回", published: "已发布" }[status] || status || "");
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
  const [s, setS] = useState({ path, loading: true, data: null, error: "" });
  const request = useRef(0);
  const currentPath = useRef(path);
  currentPath.current = path;
  const load = async () => {
    const requestedPath = path;
    if (currentPath.current !== requestedPath) return;
    const current = ++request.current;
    setS({ path, loading: true, data: null, error: "" });
    try {
      const data = await api(path);
      if (current === request.current && currentPath.current === requestedPath)
        setS({ path, loading: false, data, error: "" });
    } catch (e) {
      if (current === request.current && currentPath.current === requestedPath)
        setS({ path, loading: false, data: null, error: e.message });
    }
  };
  useEffect(() => {
    load();
    return () => {
      request.current += 1;
    };
  }, [path, ...deps]);
  return s.path === path
    ? { ...s, reload: load }
    : { path, loading: true, data: null, error: "", reload: load };
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
function NotificationBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => document.visibilityState === "visible" && api("/me/notifications").then((x) => live && setCount(Number(x.unreadCount ?? asItems(x).filter((n) => !n.read).length))).catch(() => {});
    const visible = () => document.visibilityState === "visible" && load();
    load(); const timer = setInterval(load, 45000);
    window.addEventListener("focus", load); window.addEventListener("notifications-changed", load); document.addEventListener("visibilitychange", visible);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("notifications-changed", load); document.removeEventListener("visibilitychange", visible); };
  }, []);
  return <Link className="icon-button notification-bell" to="/account?tab=notifications" aria-label={count ? `${count} 条未读通知` : "通知"}><Bell />{count > 0 && <span>{count > 99 ? "99+" : count}</span>}</Link>;
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
              <NotificationBell />
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
  const { bootstrapError, config } = useSite();
  const filingNumber = String(config?.filingNumber || "").trim();
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
        <div className="footer-filing">
          {filingNumber ? (
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
              {filingNumber}
            </a>
          ) : (
            "备案信息待补充"
          )}
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
function Save({ type, id, initial = false, showLabel = false }) {
  const { user } = useSite();
  const nav = useNavigate();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setOn(!!initial); setError(""); }, [type, id, initial, user?.id]);
  async function toggle() {
    if (!user) return nav("/auth");
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`/me/bookmarks/${type}/${id}`, {
        method: on ? "DELETE" : "POST",
      });
      setOn(!on);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }
  return (
    <span className="save-control">
      <button className={`${showLabel ? "button secondary bookmark-button" : "icon-button"} ${on ? "saved" : ""}`} onClick={toggle} disabled={busy} aria-pressed={on} aria-label={on ? "取消收藏" : "收藏"}>
        <Bookmark fill={on ? "currentColor" : "none"} />{showLabel && (busy ? "处理中…" : on ? "已收藏" : "收藏店铺")}
      </button>
      {error && <small className="field-error" role="alert">{error}</small>}
    </span>
  );
}
function Card({ a }) {
  const authorId = a.author?.id || a.authorId;
  const cover = a.cover?.url;
  return (
    <article className={`article-card ${cover ? "has-cover" : "no-cover"}`}>
      {cover && <Link className="article-photo" to={`/articles/${a.id}`}><img src={cover} alt="" loading="lazy" /></Link>}
      <div className="article-copy">
        <div className="eyebrow">{a.category || "学习文章"}</div>
        <Link className="article-title" to={`/articles/${a.id}`}>
          {a.title}
        </Link>
        <p>{a.excerpt || ""}</p>
        <div className="article-meta">
          {authorId ? (
            <Link to={`/users/${authorId}`} className="author-link">
              {a.author?.nickname || a.author || "站内作者"}
            </Link>
          ) : (
            <span>{a.author?.nickname || a.author || "站内作者"}</span>
          )}
          <span>{fmt(a.date || a.createdAt)}</span>
          <Save type="article" id={a.id} initial={a.bookmarked} />
        </div>
      </div>
    </article>
  );
}
function ArticleRow({ a }) {
  const authorId = a.author?.id || a.authorId;
  const cover = a.cover?.url;
  return <article className={`article-list-row ${cover ? "has-cover" : "no-cover"}`}>
    <div className="article-list-copy"><div className="eyebrow">{a.category || "学习文章"}</div><Link className="article-title" to={`/articles/${a.id}`}>{a.title}</Link><p>{a.excerpt || ""}</p><div className="article-meta">{authorId ? <Link to={`/users/${authorId}`} className="author-link">{a.author?.nickname || a.author || "站内作者"}</Link> : <span>{a.author?.nickname || a.author || "站内作者"}</span>}<span>{fmt(a.date || a.createdAt)}</span><Save type="article" id={a.id} initial={a.bookmarked} /></div></div>
    {cover && <Link className="article-list-cover" to={`/articles/${a.id}`}><img src={cover} alt="" loading="lazy" /></Link>}
  </article>;
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
function Rows({ type, items, layout = "cards" }) {
  if (!items.length)
    return (
      <Empty
        title={type === "articles" ? "还没有公开文章" : "赛题库正在整理"}
        text="内容发布后会显示在这里。"
      />
    );
  return (
    <div className={type === "articles" ? layout === "list" ? "article-list" : "article-grid" : "problem-list"}>
      {items.map((x) =>
        type === "articles" ? (
          layout === "list" ? <ArticleRow key={x.id} a={x} /> : <Card key={x.id} a={x} />
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
        <HomeAnnouncement />
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
function HomeAnnouncement() {
  const r = useLoad("/announcement", []),
    announcement = r.data?.announcement;
  if (r.loading || r.error || !announcement) return null;
  return (
    <section className="home-announcement" aria-labelledby="home-announcement-title">
      <div className="announcement-icon" aria-hidden="true"><Megaphone /></div>
      <div>
        <span>站内公告</span>
        <h2 id="home-announcement-title">{announcement.title}</h2>
        <p>{announcement.body}</p>
      </div>
    </section>
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
  const [articleLayout, setArticleLayout] = useState(storedArticleLayout);
  function chooseArticleLayout(next) { setArticleLayout(next); try { localStorage.setItem("article-layout", next); } catch {} }
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
        <><div className="article-layout-switch" aria-label="文章布局"><button aria-pressed={articleLayout === "list"} className={articleLayout === "list" ? "selected" : ""} onClick={() => chooseArticleLayout("list")}><List />逐行列表</button><button aria-pressed={articleLayout === "cards"} className={articleLayout === "cards" ? "selected" : ""} onClick={() => chooseArticleLayout("cards")}><LayoutGrid />卡片</button></div><div className="chips">
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
        </div></>
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
        <Rows type={type} items={asItems(r.data)} layout={article ? articleLayout : "cards"} />
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
const PdfViewer = lazy(() => import("./PdfViewer"));
function Attachment({ f }) {
  return (
    <div className="attachment-row">
      <FileLink f={f} />
    </div>
  );
}
function PdfAttachments({ files }) {
  const { user } = useSite();
  const pdfs = (files || []).filter((f) => f.mimeType === "application/pdf" || /\.pdf$/i.test(f.originalName || f.name || ""));
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [pdfs.map((f) => f.id).join(",")]);
  if (!pdfs.length || !user) return null;
  const f = pdfs[selected] || pdfs[0];
  return (
    <section className="pdf-reader-section">
      <div className="pdf-reader-heading"><div><h2>在线阅读</h2><p>页面按需加载，可连续滚动阅读。</p></div>
        {pdfs.length > 1 && <label>选择 PDF<select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>{pdfs.map((x, i) => <option key={x.id} value={i}>{x.originalName || x.name}</option>)}</select></label>}
      </div>
      <Suspense fallback={<Loading />}><PdfViewer key={f.id} url={f.url || `/api/files/${f.id}`} name={f.originalName || f.name || "PDF 附件"} /></Suspense>
    </section>
  );
}
function AuthorBadge({ author, date }) {
  const id = author?.id;
  const name = author?.nickname || (typeof author === "string" ? author : "站内作者");
  return <div className="author-badge"><span className="author-avatar">{name?.[0] || "作"}</span><div><span className="author-role">本文作者 · 社区成员</span>{id ? <Link className="author-name" to={`/users/${id}`}>{name}</Link> : <strong>{name}</strong>}<span className="author-foot">{date && <small>发布于 {fmt(date)}</small>}{id && <Link to={`/users/${id}`}>查看主页 →</Link>}</span></div></div>;
}
function Detail({ type }) {
  const { id } = useParams();
  const r = useLoad(`/${type}/${id}`, [type, id]);
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
          </>
        )}
        <div className="article-meta detail-meta">
          {article ? <AuthorBadge author={typeof x.author === "object" ? x.author : { id: x.authorId, nickname: x.author }} date={x.date || x.createdAt} /> : <span>{fmt(x.date || x.createdAt)}</span>}
          <Save
            type={article ? "article" : "problem"}
            id={x.id}
            initial={x.bookmarked}
          />
        </div>
        <PdfAttachments files={downloadableFiles(x.attachments)} />
        {!article && (
          <p className="classification-note">
            “信号、控制、电源、其他”由本站按学习方向整理，可能与官方题目类别不同；题目原文与竞赛归属以官网资料为准。
          </p>
        )}
        {x.body || x.content || x.description ? (
          <MD>{x.body || x.content || x.description}</MD>
        ) : !article ? (
          <p className="official-body-note">题目原文可直接阅读上方 PDF，也可下载后查看。</p>
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
        {downloadableFiles(x.attachments).length > 0 && (
          <section className="attachments">
            <h2>附件</h2>
            {downloadableFiles(x.attachments).map((f) => (
              <Attachment f={f} key={f.id} />
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
        <Comments type={article ? "article" : "problem"} id={x.id} contentAuthorId={article ? x.author?.id || x.authorId : null} />
      </article>
    </div>
  );
}
function Comments({ type, id, contentAuthorId }) {
  const { user } = useSite();
  const nav = useNavigate();
  const [sort, setSort] = useState("popular");
  const [page, setPage] = useState(1);
  const loc = useLocation();
  const focus = /^#comment-(.+)$/.exec(loc.hash)?.[1] || "";
  const commentsPath = `/comments?targetType=${type}&targetId=${id}&sort=${sort}&page=${page}&pageSize=20${focus ? `&focus=${encodeURIComponent(focus)}` : ""}`;
  const r = useLoad(commentsPath, [type, id, sort, page, focus]);
  const [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [active, setActive] = useState(null),
    [inline, setInline] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => { setPage(1); }, [type, id, sort]);
  useEffect(() => {
    if (!r.loading && focus) requestAnimationFrame(() => document.getElementById(`comment-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [r.loading, focus]);
  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy("main");
    try {
      await api("/comments", {
        method: "POST",
        body: { targetType: type, targetId: id, body },
      });
      setBody("");
      setNotice("评论已发表"); await r.reload();
    } catch (x) {
      setError(x.message);
    } finally { setBusy(""); }
  }
  function chooseMode(next) {
    setMode(next); setError(""); setSuccess(""); setSent(false);
    setF((current) => ({ ...current, code: "", confirmPassword: "" }));
  }
  async function sendInline(e, commentId, kind) {
    e.preventDefault();
    if (!inline.trim()) return;
    setBusy(`${kind}-${commentId}`);
    setError("");
    setNotice("");
    try {
      if (kind === "reply") {
        await api("/comments", {
          method: "POST",
          body: { targetType: type, targetId: id, parentId: commentId, body: inline.trim() },
        });
        setNotice("回复已发表");
      } else {
        await api(`/comments/${commentId}/report`, {
          method: "POST",
          body: { reason: inline.trim() },
        });
        setNotice("举报已提交审核");
      }
      setActive(null);
      setInline("");
      await r.reload();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy("");
    }
  }
  async function like(commentId) {
    setBusy(`like-${commentId}`); setError("");
    try { await api(`/comments/${commentId}/like`, { method: "POST" }); await r.reload(); }
    catch (x) { setError(x.message); } finally { setBusy(""); }
  }
  async function remove(commentId) {
    setBusy(`delete-${commentId}`); setError("");
    try { await api(`/comments/${commentId}`, { method: "DELETE" }); setActive(null); setNotice("评论已删除"); await r.reload(); }
    catch (x) { setError(x.message); } finally { setBusy(""); }
  }
  const commentAuthors = new Map(asItems(r.data).map((c) => [c.id, c.author?.nickname]));
  return (
    <section className="comments">
      <div className="comments-head"><h2><MessageSquare />讨论</h2><div className="comment-sort"><button className={sort === "popular" ? "selected" : ""} onClick={() => { if (focus) nav(loc.pathname, { replace: true }); setPage(1); setSort("popular"); }}>热门</button><button className={sort === "latest" ? "selected" : ""} onClick={() => { if (focus) nav(loc.pathname, { replace: true }); setPage(1); setSort("latest"); }}>最新</button></div></div>
      {r.data?.focused && <button className="text-button view-all-comments" onClick={() => { nav(loc.pathname, { replace: true }); setPage(1); }}>← 查看全部讨论</button>}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <Err error={r.error} />
      ) : asItems(r.data).length ? (
        asItems(r.data).map((c) => (
          <article className={`comment ${c.parentId ? "comment-reply" : ""}`} id={`comment-${c.id}`} key={c.id}>
            {c.parentId && commentAuthors.get(c.parentId) && <small className="reply-target">回复 @{commentAuthors.get(c.parentId)}</small>}
            {c.deleted ? <><strong className="muted">已删除</strong><p className="deleted-comment">该评论已删除，后续回复保留。</p></> : <>
              <div className="comment-author"><span className="comment-avatar">{(c.author?.nickname || "用户")[0]}</span><div>{c.author?.id || c.authorId ? <Link to={`/users/${c.author?.id || c.authorId}`}>{c.author?.nickname || "用户"}</Link> : <strong>{c.author?.nickname || "用户"}</strong>}<span>{(c.author?.id || c.authorId) === contentAuthorId ? "作者" : "社区成员"} · {fmt(c.createdAt)}</span></div></div>
              {!(c.author?.id || c.authorId) && <p>{c.body}</p>}
            </>}
            {!c.deleted && (c.author?.id || c.authorId) && <p>{c.body}</p>}
            <div className="comment-actions"><span className="comment-action-spacer" />
            {!c.deleted && (user ? <button className={`like-button ${c.liked ? "selected" : ""}`} aria-pressed={!!c.liked} disabled={busy === `like-${c.id}`} onClick={() => like(c.id)}>赞 {c.likeCount || 0}</button> : <Link className="text-button" to={`/auth?next=${encodeURIComponent(location.pathname + location.hash)}`}>赞 {c.likeCount || 0}</Link>)}
            {user && (
              <>
                {!c.deleted && c.canReply !== false && <button className="text-button" onClick={() => { setActive({ id: c.id, kind: "reply" }); setInline(""); setError(""); }}>
                  {(c.author?.id || c.authorId) === user.id ? "追评" : "回复"}
                </button>}
                {!c.deleted && (c.author?.id || c.authorId) !== user.id && <button className="text-button" onClick={() => { setActive({ id: c.id, kind: "report" }); setInline(""); setError(""); }}>
                  举报
                </button>}
                {!c.deleted && c.canDelete && <button className="text-button danger" onClick={() => setActive({ id: c.id, kind: "delete" })}>{c.canModerateDelete ? "管理删除" : "删除"}</button>}
              </>
            )}</div>
            {active?.id === c.id && active.kind === "delete" && <div className="delete-confirm" role="alert"><p>{c.canModerateDelete ? "确认以管理员身份删除这条评论？" : "确认删除自己的评论？"} 删除后原文不会恢复；若已有回复，这里会保留删除占位。</p><div className="inline-actions"><button className="button danger-button small" disabled={busy === `delete-${c.id}`} onClick={() => remove(c.id)}>确认删除</button><button className="button secondary small" onClick={() => setActive(null)}>取消</button></div></div>}
            {active?.id === c.id && active.kind !== "delete" && (
              <form className="comment-inline-form" onSubmit={(e) => sendInline(e, c.id, active.kind)}>
                <label>
                  {active.kind === "reply" ? `回复 ${c.author?.nickname || "该用户"}` : "举报原因"}
                  <textarea autoFocus required minLength={active.kind === "report" ? 2 : 1} maxLength={active.kind === "report" ? 500 : 1000} value={inline} onChange={(e) => setInline(e.target.value)} placeholder={active.kind === "reply" ? "写下你的回复…" : "请具体说明需要审核的问题…"} />
                </label>
                <div className="inline-actions">
                  <button className="button primary small" disabled={!!busy}>{busy ? "提交中…" : "提交"}</button>
                  <button type="button" className="button secondary small" onClick={() => { setActive(null); setInline(""); }}>取消</button>
                </div>
              </form>
            )}
          </article>
        ))
      ) : (
        <p className="muted">还没有评论。</p>
      )}
      {!r.loading && !r.error && !r.data?.focused && r.data?.total > r.data?.pageSize && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button><span>第 {page} / {Math.ceil(r.data.total / r.data.pageSize)} 页</span><button disabled={page >= Math.ceil(r.data.total / r.data.pageSize)} onClick={() => setPage((p) => p + 1)}>下一页</button></div>}
      {notice && <div className="success-box" role="status"><Check />{notice}</div>}
      <Err error={error} />
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
          <button className="button primary" disabled={busy === "main"}>{busy === "main" ? "发表中…" : "发表评论"}</button>
        </form>
      ) : (
        <p>
          <Link to="/auth">登录</Link>后参与讨论、回复和点赞。
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
        <div className="shop-title-row">
          <h1>{s.name}</h1>
          <Save type="shop" id={s.id || id} initial={s.bookmarked} showLabel />
        </div>
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
                  {x.pros && <p><b>优点：</b>{x.pros}</p>}
                  {x.cons && <p><b>不足：</b>{x.cons}</p>}
                  <p>{x.content || x.purchaseExperience}</p>
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
        <ReviewForm
          id={id}
          reload={r.reload}
          reviewLimit={s.reviewLimit}
          reviewCount={s.myReviewCount}
          reviewRemaining={s.myReviewRemaining}
        />
      </div>
    </div>
  );
}
function ReviewForm({ id, reload, reviewLimit = 5, reviewCount = 0, reviewRemaining }) {
  const { user } = useSite();
  const [f, setF] = useState({
      sentiment: "positive",
      content: "",
    }),
    [proof, setProof] = useState(),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  if (!user)
    return (
      <p>
        <Link to="/auth">登录</Link>后提交评价。
      </p>
    );
  const remaining = Number.isFinite(Number(reviewRemaining))
    ? Number(reviewRemaining)
    : Math.max(0, Number(reviewLimit) - Number(reviewCount));
  const atLimit = remaining <= 0;
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (proof) fd.append("proof", proof);
    try {
      await api(`/shops/${id}/reviews`, { method: "POST", body: fd });
      setDone(true);
      reload();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form-section">
      <h2>提交购买评价</h2>
      <p className="muted">审核通过后公开并计入评分。每位用户对同一家店铺最多提交 {reviewLimit} 条，可分别记录不同购买经历和评价倾向。</p>
      <p className={`review-quota ${atLimit ? "limit-reached" : ""}`} role="status">
        {atLimit
          ? `你已用完该店铺的 ${reviewLimit} 个评价名额。已有评价仍可在个人中心编辑或撤回。`
          : `你已提交 ${reviewCount} 条，还可提交 ${remaining} 条。`}
        {atLimit && <Link to="/account?tab=reviews">管理我的评价</Link>}
      </p>
      {done ? (
        <div className="success-box">
          <Check />
          已提交审核。
        </div>
      ) : atLimit ? null : (
        <form className="form-grid" onSubmit={submit}>
          <label>评价倾向
            <select value={f.sentiment} onChange={(e) => setF({ ...f, sentiment: e.target.value })}>
              <option value="positive">好评</option><option value="neutral">中评</option><option value="negative">差评</option>
            </select>
          </label>
          <label className="span-2">评价内容
            <textarea required minLength="2" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="写下真实购买与使用体验" />
          </label>
          <label>
            购买凭证（可选）
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setProof(e.target.files[0])}
            />
          </label>
          <Err error={error} />
          <button className="button primary" disabled={busy}>{busy ? "提交中…" : "提交审核"}</button>
        </form>
      )}
    </section>
  );
}
function ReviewEdit() {
  const { user } = useSite();
  const { id } = useParams();
  const nav = useNavigate();
  const r = useLoad(`/reviews/${id}/edit`, [id]);
  const [loaded, setLoaded] = useState(null), [error, setError] = useState(""), [saved, setSaved] = useState(""), [busy, setBusy] = useState(false);
  const f = loaded?.id === id ? loaded.data : null;
  const setF = (next) => setLoaded((current) => ({ id, data: typeof next === "function" ? next(current?.id === id ? current.data : {}) : next }));
  useEffect(() => { if (r.data) setLoaded({ id, data: { sentiment: r.data.sentiment || (r.data.rating >= 4 ? "positive" : r.data.rating <= 2 ? "negative" : "neutral"), content: r.data.content || r.data.purchaseExperience || [r.data.pros, r.data.cons].filter(Boolean).join("\n") } }); }, [id, r.data]);
  if (!user) return <Navigate to="/auth" />;
  if (r.loading || !f && !r.error) return <Loading />;
  if (r.error) return <div className="container page"><Err error={r.error} retry={r.reload} /></div>;
  async function save(submit) { if (busy) return; setBusy(true); setError(""); setSaved(""); try { await api(`/reviews/${id}`, { method: "PATCH", body: f }); if (submit) { await api(`/reviews/${id}/submit`, { method: "POST" }); nav("/account?tab=reviews"); } else setSaved("评价修改已保存，提交审核前不会替换公开版本"); } catch (x) { setError(x.message); } finally { setBusy(false); } }
  return <div className="container page review-edit"><Link className="back-link" to="/account?tab=reviews">← 返回我的评价</Link><h1>编辑店铺评价</h1><p className="lead">已公开评价在普通修改审核期间继续展示旧版；审核通过后以同一条评价更新。</p><p className="muted">原购买凭证会继续保留，仅本人和有权限的审核员可见。</p>{r.data?.status === "pending" && <div className="status status-pending">修改正在审核中</div>}<Err error={error} />{saved && <div className="success-box"><Check />{saved}</div>}<div className="panel form-stack"><label>评价倾向<select value={f.sentiment} onChange={(e) => setF({ ...f, sentiment: e.target.value })}><option value="positive">好评</option><option value="neutral">中评</option><option value="negative">差评</option></select></label><label>评价内容<textarea required minLength="2" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></label><div className="action-row"><button className="button secondary" disabled={busy} onClick={() => save(false)}>保存修改</button><button className="button primary" disabled={busy} onClick={() => save(true)}>{busy ? "处理中…" : "提交重新审核"}</button></div></div></div>;
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
    [done, setDone] = useState(false), [busy, setBusy] = useState(false);
  if (!user) return <Navigate to="/auth" />;
  async function submit(e) {
    e.preventDefault();
    if (busy) return; setBusy(true); setError("");
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
    } finally {
      setBusy(false);
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
          <button className="button primary" disabled={busy}>{busy ? "提交中…" : "提交审核"}</button>
        </form>
      )}
    </div>
  );
}
function ShopEdit() {
  const { user } = useSite();
  const { id } = useParams();
  const nav = useNavigate();
  const r = useLoad(`/shops/${id}/edit`, [id]);
  const [loaded, setLoaded] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState("");
  const f = loaded?.id === id ? loaded.data : null;
  useEffect(() => {
    if (!r.data) return;
    setLoaded({ id, data: { name: r.data.name || "", aliases: Array.isArray(r.data.aliases) ? r.data.aliases.join("，") : r.data.aliases || "", ownerId: r.data.ownerId || "", platform: r.data.platform || "", url: r.data.url || "", condition: r.data.condition || "", businessScope: r.data.businessScope || "" } });
  }, [id, r.data]);
  if (!user) return <Navigate to="/auth" />;
  if (r.loading || (!f && !r.error)) return <Loading />;
  if (r.error) return <div className="container page"><Err error={r.error} retry={r.reload} /></div>;
  if (r.data?.published) return <div className="container narrow page"><Link className="back-link" to="/account?tab=shops">← 返回我的店铺</Link><h1>编辑店铺</h1><div className="notice">已公开店铺需先在“我的店铺”中确认撤回。撤回会立即下架店铺，相关评价暂不可公开访问但仍会保留；修改后可重新提交审核。</div></div>;
  const change = (key, value) => setLoaded((current) => ({ id, data: { ...(current?.id === id ? current.data : f), [key]: value } }));
  async function save(submit) {
    if (busy) return; setBusy(true); setError(""); setSaved("");
    try {
      await api(`/shops/${id}`, { method: "PATCH", body: { ...f, aliases: f.aliases.split(/[，,]/).map((x) => x.trim()).filter(Boolean) } });
      if (submit) { await api(`/shops/${id}/submit`, { method: "POST" }); nav("/account?tab=shops"); }
      else setSaved("店铺修改已保存，提交审核前不会更新公开信息");
    } catch (x) { setError(x.message); } finally { setBusy(false); }
  }
  return <div className="container narrow page"><Link className="back-link" to="/account?tab=shops">← 返回我的店铺</Link><h1>编辑店铺</h1><p className="lead">名称为必填项，其余信息可按实际情况补充；保存后可重新提交审核。</p><Err error={error} />{saved && <div className="success-box"><Check />{saved}</div>}<div className="panel form-stack">{Object.entries({ name: "店铺名称", aliases: "别名（逗号分隔）", ownerId: "店主标识", platform: "所在平台", url: "店铺链接", condition: "经营状态", businessScope: "经营范围" }).map(([key, label]) => <label key={key}>{label}<input type={key === "url" ? "url" : "text"} required={key === "name"} value={f[key]} onChange={(e) => change(key, e.target.value)} /></label>)}<div className="action-row"><button type="button" className="button secondary" disabled={busy} onClick={() => save(false)}>保存修改</button><button type="button" className="button primary" disabled={busy} onClick={() => save(true)}>{busy ? "处理中…" : "提交重新审核"}</button></div></div></div>;
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
      confirmPassword: "",
    }),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false),
    [cooldown, setCooldown] = useState(0),
    [cooldownUntil, setCooldownUntil] = useState(0),
    [codeBusy, setCodeBusy] = useState(false),
    [submitBusy, setSubmitBusy] = useState(false),
    [success, setSuccess] = useState("");
  const nav = useNavigate(),
    [sp] = useSearchParams();
  const normalizedEmail = f.email.trim().toLowerCase();
  useEffect(() => {
    if (!normalizedEmail) { setCooldown(0); return; }
    try {
      const until = Number(localStorage.getItem(`auth-code-until:${normalizedEmail}`)) || 0;
      setCooldownUntil(until);
      setCooldown(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    } catch { setCooldownUntil(0); setCooldown(0); }
  }, [normalizedEmail]);
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const update = () => setCooldown(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [cooldownUntil]);
  if (user) return <Navigate to={sp.get("next") || "/account"} />;
  function chooseMode(next) {
    if (codeBusy || submitBusy) return;
    setMode(next); setError(""); setSuccess(""); setSent(false);
    setF((current) => ({ ...current, code: "", confirmPassword: "" }));
  }
  async function code() {
    if (codeBusy || cooldown > 0 || !normalizedEmail) return;
    setCodeBusy(true); setError(""); setSuccess("");
    try {
      const result = await api("/auth/request-code", {
        method: "POST",
        body: {
          email: normalizedEmail,
          purpose: mode === "reset" ? "reset" : "register",
        },
      });
      setSent(true);
      const seconds = Number(result.cooldownSeconds || result.retryAfter) || 60;
      const until = Date.now() + seconds * 1000;
      setCooldownUntil(until);
      setCooldown(seconds);
      try { localStorage.setItem(`auth-code-until:${normalizedEmail}`, String(until)); } catch {}
      setSuccess(
        mode === "register"
          ? "若该邮箱可用于注册，验证码将发送；若收件箱中没有，请检查垃圾邮件或广告邮件。"
          : "若该邮箱可用于此操作，验证码将发送，请在 1 分钟内完成验证。",
      );
    } catch (x) {
      setError(x.message);
      if (x.retryAfter > 0) {
        const until = Date.now() + x.retryAfter * 1000;
        setCooldownUntil(until); setCooldown(x.retryAfter);
        try { localStorage.setItem(`auth-code-until:${normalizedEmail}`, String(until)); } catch {}
      }
    } finally {
      setCodeBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (submitBusy) return;
    setError(""); setSuccess("");
    if (mode !== "login" && !/^\d{6}$/.test(f.code)) { setError("请输入 6 位数字验证码"); return; }
    if (mode !== "login" && (mode === "reset" ? f.newPassword : f.password) !== f.confirmPassword) { setError("两次输入的密码不一致"); return; }
    setSubmitBusy(true);
    try {
      if (mode === "login")
        await api("/auth/login", {
          method: "POST",
          body: { email: normalizedEmail, password: f.password },
        });
      else if (mode === "register")
        await api("/auth/register", {
          method: "POST",
          body: {
            email: normalizedEmail,
            code: f.code,
            password: f.password,
            nickname: f.nickname,
          },
        });
      else
        await api("/auth/reset-password", {
          method: "POST",
          body: { email: normalizedEmail, code: f.code, newPassword: f.newPassword },
        });
      if (mode === "reset") {
        setMode("login");
        setSent(false);
        setF((current) => ({ ...current, code: "", password: "", newPassword: "", confirmPassword: "" }));
        setSuccess("密码已重置，请使用新密码登录。");
      } else {
        await refresh();
        nav(sp.get("next") || "/account");
      }
    } catch (x) {
      setError(x.message);
    } finally {
      setSubmitBusy(false);
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
          <button type="button" disabled={codeBusy || submitBusy} className={mode === "login" ? "active" : ""} onClick={() => chooseMode("login")}>登录</button>
          <button
            disabled={!config.registrationEnabled || codeBusy || submitBusy}
            className={mode === "register" ? "active" : ""}
            onClick={() => chooseMode("register")}
          >
            注册
          </button>
          <button
            disabled={!config.registrationEnabled || codeBusy || submitBusy}
            className={mode === "reset" ? "active" : ""}
            onClick={() => chooseMode("reset")}
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
              autoComplete="email"
              value={f.email}
              disabled={codeBusy || submitBusy}
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
                  onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength="6"
                  autoComplete="one-time-code"
                  aria-describedby="code-help"
                  required
                />
                <button
                  type="button"
                  className="button secondary"
                  onClick={code}
                  disabled={!normalizedEmail || codeBusy || cooldown > 0}
                >
                  {codeBusy ? "发送中…" : cooldown > 0 ? `${cooldown} 秒后可重发` : sent ? "重新发送" : "发送验证码"}
                </button>
              </div>
              <small id="code-help">
                验证码为 6 位数字，发送后 1 分钟内有效。
                {mode === "register" && " 若收件箱中没有，请检查垃圾邮件或广告邮件。"}
              </small>
            </label>
          )}
          <label>
            {mode === "reset" ? "新密码" : "密码"}
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
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
          {mode !== "login" && (
            <label>
              确认密码
              <input type="password" minLength="10" autoComplete="new-password" value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} required />
            </label>
          )}
          {success && <div className="success-box" role="status"><Check />{success}</div>}
          <Err error={error} />
          <button className="button primary full" disabled={submitBusy}>
            {submitBusy ? "处理中…" : mode === "login"
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
    draftParam = sp.get("draft"),
    [f, setF] = useState({
      title: "",
      category: topics[0].name,
      tags: "",
      excerpt: "",
      body: starterMarkdown,
    }),
    [id, setId] = useState(draftParam),
    [files, setFiles] = useState([]),
    [cover, setCover] = useState(null),
    [draggingImage, setDraggingImage] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [imageBusy, setImageBusy] = useState(false),
    [loadingDraft, setLoadingDraft] = useState(!!draftParam),
    [draftLoadError, setDraftLoadError] = useState(""),
    [draftRetry, setDraftRetry] = useState(0),
    [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  const loadedDraft = useRef(null);
  const seenDraftParam = useRef(draftParam);
  const editorSession = useRef(0);
  const editorSessionParam = useRef(draftParam);
  const pendingDraftParam = useRef(null);
  const uploadLock = useRef(false);
  const savingRef = useRef(false);
  if (editorSessionParam.current !== draftParam) {
    editorSessionParam.current = draftParam;
    if (pendingDraftParam.current === draftParam) pendingDraftParam.current = null;
    else editorSession.current += 1;
  }
  const nav = useNavigate();
  useEffect(() => {
    if (draftParam === seenDraftParam.current) return;
    seenDraftParam.current = draftParam;
    if (draftParam === id) return;
    loadedDraft.current = null;
    setError(""); setDraftLoadError(""); setSaved(""); setFiles([]); setCover(null); setId(draftParam);
    if (draftParam) setLoadingDraft(true);
    else {
      setLoadingDraft(false);
      setF({ title: "", category: topics[0].name, tags: "", excerpt: "", body: starterMarkdown });
    }
  }, [draftParam, id]);
  useEffect(() => {
    let live = true;
    if (id && loadedDraft.current !== id) {
      const requestedId = id;
      setLoadingDraft(true); setDraftLoadError("");
      api(`/articles/drafts/${id}`).then((d) => {
        if (live && loadedDraft.current !== requestedId) {
          loadedDraft.current = requestedId;
          setF({ ...d, tags: (d.tags || []).join(",") }); setCover(d.cover || null);
          setLoadingDraft(false);
        }
      }).catch((x) => { if (live) { setDraftLoadError(x.message); setLoadingDraft(false); } });
    }
    return () => { live = false; };
  }, [id, draftRetry]);
  if (!user) return <Navigate to="/auth" />;
  if (loadingDraft) return <div className="container editor-page"><h1>载入草稿</h1><Loading /></div>;
  if (id && (draftLoadError || loadedDraft.current !== id)) return (
    <div className="container editor-page draft-load-error">
      <h1>无法打开草稿</h1>
      <Err error={draftLoadError || "草稿尚未载入"} />
      <div className="action-row">
        <button className="button primary" onClick={() => { setLoadingDraft(true); setDraftLoadError(""); setDraftRetry((n) => n + 1); }}>重试</button>
        <Link className="button secondary" to="/account?tab=drafts">返回草稿列表</Link>
      </div>
    </div>
  );
  async function ensureDraft() {
    if (id) return id;
    const startingSession = editorSession.current;
    const { cover: _cover, ...draftFields } = f;
    const body = { ...draftFields, tags: f.tags.split(/[，,]/).map((x) => x.trim()).filter(Boolean) };
    const created = await api("/articles/drafts", { method: "POST", body });
    if (startingSession !== editorSession.current) return null;
    const did = created.id || created.draft?.id;
    loadedDraft.current = did;
    pendingDraftParam.current = did;
    editorSession.current += 1;
    setId(did);
    nav(`/write?draft=${did}`, { replace: true });
    return did;
  }
  function insertMarkdown(text, selectStart = 0, selectLength = 0, fixedRange) {
    const el = editorRef.current;
    const start = fixedRange?.start ?? el?.selectionStart ?? f.body.length;
    const end = fixedRange?.end ?? el?.selectionEnd ?? start;
    setF((current) => ({ ...current, body: `${current.body.slice(0, start)}${text}${current.body.slice(end)}` }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + selectStart, start + selectStart + selectLength);
    });
  }
  async function uploadImage(file, asCover = false) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError("仅支持 PNG、JPEG 或 WebP 图片"); return; }
    if (uploadLock.current || savingRef.current) { setError("请等待当前保存或图片上传完成"); return; }
    uploadLock.current = true;
    const startingSession = editorSession.current;
    let session = startingSession;
    const range = asCover ? null : { start: editorRef.current?.selectionStart ?? f.body.length, end: editorRef.current?.selectionEnd ?? f.body.length };
    setImageBusy(true); setError(""); setSaved("");
    try {
      const did = await ensureDraft();
      if (!did) return;
      session = id ? startingSession : editorSession.current;
      const fd = new FormData(); fd.append("image", file);
      const result = await api(`/articles/drafts/${did}/images`, { method: "POST", body: fd });
      if (session !== editorSession.current) return;
      if (asCover) { setCover({ id: result.id, name: result.name, url: result.markdownUrl }); setF((current) => ({ ...current, coverImageId: result.id })); setSaved("封面已选择，请保存草稿"); }
      else { insertMarkdown(`\n${result.markdown || `![${result.name}](${result.markdownUrl})`}\n`, 0, 0, range); setSaved("图片已上传并插入正文，请继续保存草稿"); }
    } catch (x) { if (session === editorSession.current) setError(x.message); } finally { uploadLock.current = false; setImageBusy(false); }
  }
  function pastedImage(event) { const file = [...(event.clipboardData?.files || [])].find((x) => x.type.startsWith("image/")); if (file) { event.preventDefault(); uploadImage(file); } }
  function droppedImage(event) { const files = [...(event.dataTransfer?.files || [])]; const file = files.find((x) => x.type.startsWith("image/")); setDraggingImage(false); if (files.length) event.preventDefault(); if (file) uploadImage(file); else if (files.length) setError("请拖入 PNG、JPEG 或 WebP 图片"); }
  async function save(submit) {
    if (savingRef.current || uploadLock.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const { cover: _cover, ...draftFields } = f;
      const body = {
        ...draftFields,
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
      loadedDraft.current = did;
      setId(did);
      if (!id) nav(`/write?draft=${did}`, { replace: true });
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
    } finally { savingRef.current = false; setSaving(false); }
  }
  return (
    <div className="container editor-page">
      <div className="editor-head">
        <div>
          <h1>写文章</h1>
          <p>Markdown 草稿可反复保存；已发布内容修改后重新审核，审核期间旧公开版继续展示。</p>
        </div>
        <div>
          <button className="button secondary" disabled={saving || imageBusy} onClick={() => save(false)}>
            {saving ? "保存中…" : "保存草稿"}
          </button>
          <button className="button primary" disabled={saving || imageBusy} onClick={() => save(true)}>
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
            {f.category && !topics.some((t) => t.name === f.category) && (
              <option value={f.category} disabled>{f.category}（旧分类，仅保留）</option>
            )}
            {topics.map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </select>
        </label>
        <div className="cover-editor">
          <strong>文章封面（可选）</strong>
          <small>只有主动选择封面的文章才展示图片，不会从正文自动推断。</small>
          {cover?.url && <img src={cover.url} alt="当前文章封面预览" />}
          <div className="cover-actions"><label className="button secondary small">{cover ? "替换封面" : "选择封面"}<input hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={imageBusy || saving} onChange={(e) => { uploadImage(e.target.files?.[0], true); e.target.value = ""; }} /></label>{(cover || f.coverImageId) && <button type="button" disabled={imageBusy || saving} className="text-button danger" onClick={() => { setCover(null); setF((current) => ({ ...current, coverImageId: null })); setSaved("封面已移除，请保存草稿"); }}>移除封面</button>}</div>
        </div>
        <label className="editor-attachment-field">
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
        <div className="editor-field">
          <label htmlFor="markdown-body">Markdown</label>
          <div className="markdown-toolbar" role="toolbar" aria-label="Markdown 工具栏">
            <button type="button" onClick={() => insertMarkdown("[链接文字](https://example.com)", 1, 4)}><Link2 size={17} />插入链接</button>
            <label className="toolbar-upload">
              <Image size={17} />{imageBusy ? "上传中…" : "上传图片"}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={imageBusy} onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <small>PNG / JPEG / WebP，最大 5 MiB</small>
          </div>
          <textarea
            id="markdown-body"
            ref={editorRef}
            value={f.body}
            onChange={(e) => setF({ ...f, body: e.target.value })}
            onPaste={pastedImage}
            onDragOver={(e) => { if ([...(e.dataTransfer?.items || [])].some((x) => x.type.startsWith("image/"))) { e.preventDefault(); setDraggingImage(true); } }}
            onDragLeave={() => setDraggingImage(false)}
            onDrop={droppedImage}
            className={`editor-textarea ${draggingImage ? "editor-drop-active" : ""}`}
          />
        </div>
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
    [bio, setBio] = useState(user.bio || ""),
    [pw, setPw] = useState({ currentPassword: "", newPassword: "" }),
    [status, setStatus] = useState("");
  async function update(e) {
    e.preventDefault();
    try {
      await api("/me", { method: "PATCH", body: { nickname, bio } });
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
        <label>
          个人简介
          <textarea maxLength="500" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="介绍你的学习方向或项目经历" />
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
function PublicUser() {
  const { id } = useParams();
  const r = useLoad(`/users/${id}`, [id]);
  if (r.loading) return <Loading />;
  if (r.error) return <div className="container page"><Err error={r.error} retry={r.reload} /></div>;
  const u = r.data;
  return (
    <div className="container page public-profile">
      <header className="profile-hero">
        <span className="avatar">{u.nickname?.[0] || "用"}</span>
        <div className="profile-identity"><h1>{u.nickname || "社区用户"}</h1><p>{u.bio || "这位用户还没有填写简介。"}</p></div>
      </header>
      <section><h2>公开文章</h2>
        {u.articles?.length ? <div className="article-list profile-article-list">{u.articles.map((a) => <ArticleRow key={a.id} a={{ ...a, author: { id: u.id, nickname: u.nickname } }} />)}</div> : <Empty title="还没有公开文章" text="审核通过并公开的文章会显示在这里。" />}
      </section>
      <section><h2>公开评论与互动</h2>
        {u.comments?.length ? <div className="record-list">{u.comments.map((c) => <article key={c.id}><strong>{c.targetTitle || "内容讨论"}</strong><p>{c.body}</p><small>{fmt(c.createdAt)}</small>{c.href && <Link to={c.href}>回到原内容</Link>}</article>)}</div> : <Empty title="还没有公开评论" text="公开内容下可见的评论会显示在这里。" />}
      </section>
      {u.reviews?.length > 0 && <section><h2>已审核店铺评价</h2><div className="record-list">{u.reviews.map((x) => <article key={x.id}><strong>{x.shopName || "店铺评价"}{x.sentiment ? ` · ${{ positive: "好评", neutral: "中评", negative: "差评" }[x.sentiment]}` : x.rating ? ` · ${x.rating} / 5` : ""}</strong><p>{x.content || x.pros || x.purchaseExperience || x.reason}</p><small>{fmt(x.createdAt || x.date)}</small>{x.shopId && <Link to={`/shops/${x.shopId}`}>查看店铺</Link>}</article>)}</div></section>}
    </div>
  );
}
function Mine({ tab }) {
  const r = useLoad(`/me/${tab}`, [tab]);
  const nav = useNavigate();
  const [confirmWithdraw, setConfirmWithdraw] = useState(null), [withdrawBusy, setWithdrawBusy] = useState(""), [actionError, setActionError] = useState(""), [actionDone, setActionDone] = useState("");
  const withdrawType = tab === "submissions" ? "articles/drafts" : tab;
  async function withdraw(x) {
    const id = x.draftId || x.id;
    if (!id || withdrawBusy) return;
    setWithdrawBusy(String(id)); setActionError(""); setActionDone("");
    try {
      await api(`/${withdrawType}/${id}/withdraw`, { method: "POST" });
      setConfirmWithdraw(null);
      setActionDone("已撤回为草稿；原公开版本已立即下架，重新提交并审核通过后才会再次展示。");
      await r.reload();
    } catch (e) { setActionError(e.message); } finally { setWithdrawBusy(""); }
  }
  async function markRead() {
    try {
      await api("/me/notifications/read", { method: "POST" });
      window.dispatchEvent(new Event("notifications-changed"));
      r.reload();
    } catch (x) {
      alert(x.message);
    }
  }
  async function openNotification(x) {
    try {
      if (!x.read) await api("/me/notifications/read", { method: "POST", body: { ids: [x.id] } });
      window.dispatchEvent(new Event("notifications-changed"));
      if (x.href) nav(x.href);
      else r.reload();
    } catch (e) { alert(e.message); }
  }
  return (
    <>
      <h1>
        {
          {
            submissions: "我的投稿",
            drafts: "草稿",
            reviews: "我的评价",
            shops: "我的店铺",
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
      {actionDone && <div className="success-box" role="status"><Check />{actionDone}</div>}
      <Err error={actionError} />
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
                {statusLabel(x.status) || fmt(x.createdAt)}
              </span>
              {tab === "drafts" && (
                <Link to={`/write?draft=${x.id}`}>继续编辑</Link>
              )}
              {tab === "submissions" && (x.editUrl || x.draftId || x.id) && <Link to={x.editUrl || `/write?draft=${x.draftId || x.id}`}>{x.published ? "编辑已发表文章" : "编辑投稿"}</Link>}
              {tab === "reviews" && x.id && <Link to={x.editUrl || `/reviews/${x.id}/edit`}>编辑评价</Link>}
              {tab === "shops" && <><Link to={`/shops/${x.id}`}>查看店铺</Link><Link to={x.editUrl || `/shops/${x.id}/edit`}>编辑店铺</Link></>}
              {["submissions", "reviews", "shops"].includes(tab) && x.status !== "draft" && (
                confirmWithdraw === (x.draftId || x.id) ? <div className="withdraw-confirm"><p><strong>确认撤回？</strong> 内容会立即下架，重新提交并审核通过后才会再次展示。{tab === "shops" && "店铺下架后，其他用户对该店铺的评价也会暂时隐藏。"}</p><div className="action-row"><button type="button" className="button danger small" disabled={!!withdrawBusy} onClick={() => withdraw(x)}>{withdrawBusy ? "撤回中…" : "确认撤回"}</button><button type="button" className="button secondary small" disabled={!!withdrawBusy} onClick={() => setConfirmWithdraw(null)}>取消</button></div></div> : <button type="button" className="text-button danger" onClick={() => { setActionError(""); setConfirmWithdraw(x.draftId || x.id); }}>撤回为草稿</button>
              )}
              {tab === "bookmarks" && (
                <Link
                  to={`/${x.type === "shop" ? "shops" : `${x.type}s`}/${x.targetId || x.id}`}
                >
                  查看收藏
                </Link>
              )}
              {tab === "notifications" && x.href && (
                <button className="text-button" onClick={() => openNotification(x)}>{x.read ? "查看内容" : "标为已读并查看"}</button>
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
          ["announcement", "公告"],
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
        {type === "announcement" ? (
          <AnnouncementAdmin />
        ) : type === "accounts" ? (
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
function AnnouncementAdmin() {
  const r = useLoad("/admin/announcement", []);
  const [form, setForm] = useState({ title: "", body: "" }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [confirmAction, setConfirmAction] = useState("");
  const hydratedVersion = useRef(undefined);
  useEffect(() => {
    if (!r.data || r.data.updatedAt === hydratedVersion.current) return;
    setForm({ title: r.data.title || "", body: r.data.body || "" });
    hydratedVersion.current = r.data.updatedAt ?? null;
  }, [r.data]);
  async function saveDraft() {
    const result = await api("/admin/announcement", {
      method: "PUT",
      body: { ...form, expectedUpdatedAt: r.data?.updatedAt ?? null },
    });
    setForm({ title: result.title || "", body: result.body || "" });
    await r.reload();
    return result;
  }
  async function act(action) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "save") {
        await saveDraft();
        setMessage("公告草稿已保存，访客仍看到上一次发布的版本。");
      } else if (action === "publish") {
        const saved = await saveDraft();
        await api("/admin/announcement/publish", {
          method: "POST",
          body: { expectedUpdatedAt: saved.updatedAt },
        });
        await r.reload();
        setMessage("公告已发布到首页。");
      } else if (action === "unpublish") {
        await api("/admin/announcement/unpublish", {
          method: "POST",
          body: { expectedUpdatedAt: r.data?.updatedAt ?? null },
        });
        await r.reload();
        setMessage("公告已下架，访客首页不再显示。");
      } else if (action === "clear") {
        await api("/admin/announcement", {
          method: "DELETE",
          body: { expectedUpdatedAt: r.data?.updatedAt ?? null },
        });
        setForm({ title: "", body: "" });
        hydratedVersion.current = null;
        await r.reload();
        setMessage("公告草稿和已发布内容已清空。");
      }
      setConfirmAction("");
    } catch (x) {
      setError(x.code === "STALE_ANNOUNCEMENT" ? "公告已被其他管理员更新，请刷新后再操作。" : x.message);
    } finally { setBusy(false); }
  }
  if (r.loading && !r.data) return <Loading />;
  return (
    <>
      <h1>首页公告</h1>
      <p>编辑稿只在管理后台可见；点击发布后，首页才会显示本次内容。公告按纯文本展示并保留换行。</p>
      <Err error={r.error || error} retry={r.error ? r.reload : undefined} />
      {message && <div className="success-box" role="status"><Check />{message}</div>}
      <form className="panel form-stack announcement-editor" onSubmit={(e) => { e.preventDefault(); act("save"); }}>
        <div className="announcement-state">
          <span className={`status status-${r.data?.published ? "published" : "draft"}`}>
            {r.data?.published ? "首页正在展示" : "当前未发布"}
          </span>
          {r.data?.updatedAt && <small>最后更新：{fmt(r.data.updatedAt)}</small>}
        </div>
        <label>公告标题
          <input value={form.title} maxLength="120" disabled={busy} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <small>{form.title.length} / 120</small>
        </label>
        <label>公告内容
          <textarea value={form.body} maxLength="2000" rows="8" disabled={busy} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          <small>{form.body.length} / 2000</small>
        </label>
        <div className="action-row">
          <button className="button secondary" disabled={busy}>{busy ? "处理中…" : "保存草稿"}</button>
          <button type="button" className="button primary" disabled={busy} onClick={() => act("publish")}>保存并发布</button>
          {r.data?.published && <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmAction("unpublish")}>下架公告</button>}
          {r.data?.updatedAt && <button type="button" className="text-button danger" disabled={busy} onClick={() => setConfirmAction("clear")}>清空公告</button>}
        </div>
      </form>
      {confirmAction && <div className="moderation-confirm"><p><strong>确认{confirmAction === "clear" ? "清空" : "下架"}公告？</strong>{confirmAction === "clear" ? " 草稿和已发布内容都会删除。" : " 访客首页将立即停止显示，草稿仍会保留。"}</p><div className="action-row"><button type="button" className="button danger small" disabled={busy} onClick={() => act(confirmAction)}>{busy ? "处理中…" : `确认${confirmAction === "clear" ? "清空" : "下架"}`}</button><button type="button" className="button secondary small" disabled={busy} onClick={() => setConfirmAction("")}>取消</button></div></div>}
    </>
  );
}
function Moderation({ type }) {
  const [status, setStatus] = useState(type === "articles" ? "all" : "pending");
  const [query, setQuery] = useState(""), [submittedQuery, setSubmittedQuery] = useState(""), [page, setPage] = useState(1);
  const [moderationError, setModerationError] = useState(""), [moderationDone, setModerationDone] = useState(""), [pendingAction, setPendingAction] = useState(null), [reason, setReason] = useState(""), [decisionBusy, setDecisionBusy] = useState(false);
  const r = useLoad(`/admin/queue?type=${type}&status=${status}&q=${encodeURIComponent(type === "articles" ? submittedQuery : "")}&page=${page}&pageSize=20`, [
    type,
    status,
    submittedQuery,
    page,
  ]);
  useEffect(() => { setStatus(type === "articles" ? "all" : "pending"); setPage(1); setQuery(""); setSubmittedQuery(""); setPendingAction(null); setModerationDone(""); }, [type]);
  async function decide(item, decision) {
    if (decisionBusy) return;
    setDecisionBusy(true);
    try {
      setModerationError(""); setModerationDone("");
      await api(`/admin/${type}/${item.id}/decision`, {
        method: "POST",
        body: { decision, reason: reason.trim(), ...(decision !== "hidden" && item.updatedAt ? { expectedUpdatedAt: item.updatedAt } : {}) },
      });
      setPendingAction(null); setReason("");
      setModerationDone({ approved: "已通过", rejected: "已退回", hidden: "已下架", dismissed: "已驳回举报", removed: "已移除被举报内容" }[decision] || "操作已完成");
      await r.reload();
    } catch (x) {
      setModerationError(x.code === "STALE_REVIEW" || x.status === 409 ? "该内容已被作者更新，请刷新队列并重新审核，当前决定未提交。" : x.message);
    } finally { setDecisionBusy(false); }
  }
  function ask(item, decision) { setModerationError(""); setModerationDone(""); setReason(""); setPendingAction({ item, decision }); }
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
      <Err error={moderationError} retry={() => { setModerationError(""); r.reload(); }} />
      {moderationDone && <div className="success-box" role="status"><Check />{moderationDone}</div>}
      {type === "articles" && <form className="search-bar" onSubmit={(e) => { e.preventDefault(); setPage(1); setSubmittedQuery(query.trim()); }}><input aria-label="搜索帖子" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题、摘要或正文" /><button className="button primary">搜索</button></form>}
      <div className="chips">
        {["pending", "approved", "rejected", "hidden", ...(type === "articles" ? ["draft"] : []), "all"].map((s) => (
          <button
            key={s}
            className={status === s ? "selected" : ""}
            onClick={() => { setStatus(s); setPage(1); }}
          >
            {
              {
                pending: "待审",
                approved: "已通过",
                rejected: "已拒绝",
                hidden: "已下架",
                draft: "草稿",
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
              {x.status && <span className={`status status-${x.status}`}>{statusLabel(x.status)}</span>}
              <p>{x.excerpt || x.description || ""}</p>
              {x.body && <MD>{x.body}</MD>}
              {type === "articles" && downloadableFiles(x.attachments).length > 0 && (
                <div className="attachments">
                  <strong>投稿附件</strong>
                  {downloadableFiles(x.attachments).map((f) => (
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
                    {{ positive: "好评", neutral: "中评", negative: "差评" }[
                          x.sentiment
                        ] || (x.rating
                      ? `${x.rating} / 5`
                      :
                        x.sentiment ||
                        "未填写")}
                  </p>
                  {x.content && <p><b>评价内容：</b>{x.content}</p>}
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
              {(type === "reports" || x.status === "pending") && <button
                className="button primary small"
                onClick={() =>
                  ask(x, type === "reports" ? "dismissed" : "approved")
                }
              >
                {type === "reports" ? "驳回举报" : "通过"}
              </button>}
              {(type === "reports" || x.status === "pending") && <button
                className="button secondary small"
                onClick={() =>
                  ask(x, type === "reports" ? "removed" : "rejected")
                }
              >
                {type === "reports" ? "移除内容" : "拒绝"}
              </button>}
              {type !== "reports" && (x.published || x.status === "approved") && x.status !== "hidden" && (
                <button
                  className="button secondary small"
                  onClick={() => ask(x, "hidden")}
                >
                  下架
                </button>
              )}
              {pendingAction?.item.id === x.id && <form className="moderation-confirm" onSubmit={(e) => { e.preventDefault(); decide(x, pendingAction.decision); }}><p><strong>确认{({ approved: "通过", rejected: "退回", hidden: "下架", dismissed: "驳回举报", removed: "移除内容" })[pendingAction.decision]}“{x.title || x.name || `#${x.id}`}”？</strong>{pendingAction.decision === "hidden" && " 下架后公开页面将立即不可见。"}</p><label>处理说明（可选）<textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength="500" /></label><div className="action-row"><button className="button danger small" disabled={decisionBusy}>{decisionBusy ? "处理中…" : `确认${({ approved: "通过", rejected: "退回", hidden: "下架", dismissed: "驳回举报", removed: "移除内容" })[pendingAction.decision]}`}</button><button type="button" className="button secondary small" disabled={decisionBusy} onClick={() => { setPendingAction(null); setReason(""); }}>取消</button></div></form>}
            </article>
          ))}
        </div>
      ) : (
        <Empty title="当前筛选暂无记录" text="切换审核状态后可查看其他记录。" />
      )}
      {!r.loading && !r.error && Number(r.data?.total) > Number(r.data?.pageSize || 20) && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {page} / {Math.ceil(r.data.total / (r.data.pageSize || 20))} 页</span><button disabled={page >= Math.ceil(r.data.total / (r.data.pageSize || 20))} onClick={() => setPage((value) => value + 1)}>下一页</button></div>}
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
        从已验证邮箱用户中选择管理员。管理员可管理全部内容，只有最高管理员可管理账号；任何变更都会让该用户的现有登录失效。
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
            {selected.role === "admin" && <div className="notice">管理员可审核、下架文章、店铺和评价，并处理举报与评论；账号管理仍仅限最高管理员。</div>}
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
                    enabled: selected.enabled,
                  })
                }
              >
                {busy ? "正在保存…" : "确认角色"}
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
    [statusAction, setStatusAction] = useState(null),
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
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/problems/${item.id}`, {
        method: "PATCH",
        body: { status: next },
      });
      setMessage(`已${next === "hidden" ? "下架" : "发布"}：${item.title}`);
      setStatusAction(null);
      await r.reload();
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
                    onClick={() => { setError(""); setMessage(""); setStatusAction(item); }}
                  >
                    {item.status === "published" ? "下架" : "发布"}
                  </button>
                </div>
              </div>
              {statusAction?.id === item.id && <div className="moderation-confirm"><p><strong>确认{item.status === "published" ? "下架" : "发布"}“{item.title}”？</strong>{item.status === "published" && " 下架后将立即从公开题库移除。"}</p><div className="action-row"><button type="button" className="button danger small" disabled={busy} onClick={() => toggle(item)}>{busy ? "处理中…" : `确认${item.status === "published" ? "下架" : "发布"}`}</button><button type="button" className="button secondary small" disabled={busy} onClick={() => setStatusAction(null)}>取消</button></div></div>}
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
  const topicPhotos = ["soldering", "stm32", "oscilloscope", "pcb", "oscilloscope", "pcb"];
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="section-kicker">LEARNING PATHS</span>
        <h1>学习专题</h1>
        <p>按方向查找已审核文章，建立自己的知识路径。</p>
      </div>
      <div className="topic-grid">
        {topics.map((t, index) => (
          <Link
            className="topic-card"
            to={`/articles?category=${encodeURIComponent(t.name)}`}
            key={t.name}
          >
            <Photo id={topicPhotos[index % topicPhotos.length]} decorative />
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
        <Route path="/users/:id" element={<PublicUser />} />
        <Route path="/topics" element={<Topics />} />
        <Route path="/shops" element={<Shops />} />
        <Route path="/shops/submit" element={<ShopSubmit />} />
        <Route path="/shops/:id/edit" element={<ShopEdit />} />
        <Route path="/shops/:id" element={<ShopDetail />} />
        <Route path="/reviews/:id/edit" element={<ReviewEdit />} />
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
