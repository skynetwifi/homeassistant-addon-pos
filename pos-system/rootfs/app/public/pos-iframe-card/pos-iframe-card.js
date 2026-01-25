class PosIframeCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.url) throw new Error("pos-iframe-card: missing 'url'");
    this.config = Object.assign({ height: '100vh', allow: 'camera; microphone' }, config);

    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { display:block; width:100%; height:100%; }
      .frame { width:100%; height: ${this.config.height}; border:0; }
      .wrapper { width:100%; height:100%; }
    `;

    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper';

    const iframe = document.createElement('iframe');
    iframe.className = 'frame';
    iframe.src = this.config.url;
    iframe.setAttribute('allow', this.config.allow);
    if (this.config.sandbox) iframe.setAttribute('sandbox', this.config.sandbox);
    if (this.config.referrerpolicy) iframe.setAttribute('referrerpolicy', this.config.referrerpolicy);

    wrapper.appendChild(iframe);
    shadow.appendChild(style);
    shadow.appendChild(wrapper);
  }

  getCardSize() { return 6; }
}

customElements.define('pos-iframe-card', PosIframeCard);

export default PosIframeCard;
