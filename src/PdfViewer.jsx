import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Minus, Plus } from "lucide-react";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
function PdfPage({ doc, number, scale, root, estimatedHeight }) {
  const holder = useRef(null), canvas = useRef(null), renderTask = useRef(null);
  const [wanted, setWanted] = useState(number === 1), [state, setState] = useState("等待显示");
  useEffect(() => {
    if (!holder.current || !root) return;
    const observer = new IntersectionObserver(([entry]) => setWanted(entry.isIntersecting), { root, rootMargin: "500px 0px", threshold: .01 });
    observer.observe(holder.current); return () => observer.disconnect();
  }, [root, number]);
  useEffect(() => {
    if (!wanted || !canvas.current) { if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; } return; }
    let live = true; setState("正在加载");
    doc.getPage(number).then((page) => {
      if (!live) return;
      const viewport = page.getViewport({ scale }), ratio = Math.min(window.devicePixelRatio || 1, 2), node = canvas.current;
      node.width = Math.floor(viewport.width * ratio); node.height = Math.floor(viewport.height * ratio);
      node.style.width = `${viewport.width}px`; node.style.height = `${viewport.height}px`;
      renderTask.current = page.render({ canvasContext: node.getContext("2d"), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
      return renderTask.current.promise;
    }).then(() => live && setState("已显示")).catch((e) => live && e?.name !== "RenderingCancelledException" && setState("加载失败"));
    return () => { live = false; renderTask.current?.cancel(); };
  }, [doc, number, scale, wanted]);
  return <section ref={holder} className="pdf-page" data-page={number} aria-label={`PDF 第 ${number} 页`} style={{ minHeight: estimatedHeight }}><div className="pdf-page-label">第 {number} 页 · {state}</div><canvas ref={canvas} /></section>;
}
export default function PdfViewer({ url, name }) {
  const stageRef = useRef(null), pageRefs = useRef(new Map()), documentRef = useRef(null);
  const [root, setRoot] = useState(null), [pages, setPages] = useState(0), [naturalHeight, setNaturalHeight] = useState(842), [page, setPage] = useState(1), [scale, setScale] = useState(1), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const setStage = useCallback((node) => { stageRef.current = node; setRoot(node); }, []);
  useEffect(() => {
    if (!root || !pages) return;
    const updatePage = () => {
      const rootRect = root.getBoundingClientRect(), marker = rootRect.top + root.clientHeight * .35;
      let nearest = 1, distance = Infinity;
      pageRefs.current.forEach((node, number) => {
        const rect = node.getBoundingClientRect();
        if (rect.top <= marker && rect.bottom > marker) { nearest = number; distance = -1; return; }
        if (distance >= 0) { const next = Math.abs(rect.top - marker); if (next < distance) { distance = next; nearest = number; } }
      });
      setPage(nearest);
    };
    root.addEventListener("scroll", updatePage, { passive: true }); updatePage();
    return () => root.removeEventListener("scroll", updatePage);
  }, [root, pages]);
  const fitWidth = async (doc = documentRef.current) => {
    if (!doc || !stageRef.current) return;
    const first = await doc.getPage(1), natural = first.getViewport({ scale: 1 });
    const available = Math.max(240, stageRef.current.clientWidth - (window.innerWidth <= 560 ? 24 : 44));
    setScale(Math.max(.4, Math.min(2.4, available / natural.width)));
  };
  useEffect(() => {
    let live = true; setPage(1); setPages(0); setError(""); setLoading(true);
    const task = pdfjs.getDocument({ url, withCredentials: true, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65536, isEvalSupported: false });
    task.promise.then(async (doc) => { if (!live) return doc.destroy(); documentRef.current = doc; const first = await doc.getPage(1); const natural = first.getViewport({ scale: 1 }); if (!live) return; setNaturalHeight(natural.height); setPages(doc.numPages); setLoading(false); requestAnimationFrame(() => fitWidth(doc)); }).catch((e) => { if (live) { setError(e.message || "PDF 加载失败"); setLoading(false); } });
    return () => { live = false; task.destroy(); documentRef.current = null; };
  }, [url]);
  function go(value) { const next = Math.max(1, Math.min(pages, Number(value) || 1)); setPage(next); pageRefs.current.get(next)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  if (error) return <div className="pdf-error" role="alert"><strong>预览失败</strong><p>{error}</p><a className="button primary" href={url}>下载后查看</a></div>;
  return <div className="pdf-inline-reader" aria-label={`${name} PDF 阅读器`}>
    <div className="pdf-toolbar"><strong title={name}>{name}</strong><label>页码 <input type="number" min="1" max={pages || 1} value={page} onChange={(e) => go(e.target.value)} /> / {pages || "—"}</label><button aria-label="缩小" disabled={scale <= .4} onClick={() => setScale((s) => Math.max(.4, s - .2))}><Minus /></button><span>{Math.round(scale * 100)}%</span><button aria-label="放大" disabled={scale >= 2.4} onClick={() => setScale((s) => Math.min(2.4, s + .2))}><Plus /></button><button onClick={() => fitWidth()}>适合宽度</button><a href={url}><Download />下载 PDF</a></div>
    {loading ? <div className="pdf-loading">正在加载 PDF…</div> : <div className="pdf-continuous" ref={setStage}>{Array.from({ length: pages }, (_, i) => <div key={i + 1} ref={(node) => node ? pageRefs.current.set(i + 1, node) : pageRefs.current.delete(i + 1)}><PdfPage doc={documentRef.current} number={i + 1} scale={scale} root={root} estimatedHeight={`${Math.max(360, naturalHeight * scale + 46)}px`} /></div>)}</div>}
  </div>;
}
