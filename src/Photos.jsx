import photos from "./photo-data.json";
export function photoForArticle(a) {
  return (
    {
      "adc-notes": "stm32",
      "power-debug": "soldering",
      "pid-start": "oscilloscope",
      "pcb-check": "pcb",
    }[a.id] || photoForTopic(a.category)
  );
}
export function photoForTopic(name) {
  return (
    {
      单片机与嵌入式: "stm32",
      模拟电路: "pcb",
      电源设计: "soldering",
      测量与信号处理: "oscilloscope",
      "PCB 设计": "pcb",
      控制与自动化: "oscilloscope",
    }[name] || "soldering"
  );
}
export function Photo({
  id,
  className = "",
  priority = false,
  sizes = "(max-width: 620px) 100vw, 600px",
  decorative = false,
}) {
  const p = photos.find((p) => p.id === id) || photos[0];
  return (
    <img
      className={"real-photo photo-" + p.id + " " + className}
      src={"/photos/" + p.id + "-640.webp"}
      srcSet={
        p.width > 640
          ? "/photos/" +
            p.id +
            "-640.webp 640w, /photos/" +
            p.id +
            "-1200.webp 1200w"
          : undefined
      }
      sizes={sizes}
      alt={decorative ? "" : p.alt}
      width={p.width}
      height={p.height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}
export function PhotoCredit({ id }) {
  const p = photos.find((p) => p.id === id) || photos[0];
  return (
    <span className="photo-credit">
      摄影：
      <a href={p.source} target="_blank" rel="noopener noreferrer">
        {p.author}
      </a>
      <span> · </span>
      <a href={p.licenseUrl} target="_blank" rel="noopener noreferrer">
        {p.license}
      </a>
    </span>
  );
}
export function PhotoCredits() {
  return (
    <section id="photo-credits" className="photo-credits-section">
      <h2>照片来源</h2>
      <p>
        这些实物照片用于展示电子设计与实验场景，不代表本站原创项目或官方赛题成果。感谢摄影者分享作品。
      </p>
      <div className="credit-grid">
        {photos.map((p) => (
          <article className="credit-item" key={p.id}>
            <Photo id={p.id} />
            <div>
              <h3>{p.title}</h3>
              <PhotoCredit id={p.id} />
              <p>
                已缩小尺寸并转换为 WebP，页面中按容器裁切显示。
                {p.license.startsWith("CC")
                  ? "此图片及其衍生版本继续采用 " + p.license + " 许可。"
                  : ""}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
