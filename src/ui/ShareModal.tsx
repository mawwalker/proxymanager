import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { copyText } from "@ui/lib";
import type { ShareTarget } from "@ui/types";

export function ShareModal(props: {
  onClose: () => void;
  target: ShareTarget;
}) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(props.target.value, {
      margin: 1,
      width: 240,
    }).then(setQr);
  }, [props.target.value]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-modal="true" className="modal-card" role="dialog">
        <div className="section-title">
          <div>
            <h2>{props.target.label}</h2>
            <p className="supporting compact">
              Scan the QR code or copy the generated payload.
            </p>
          </div>
          <div className="section-actions">
            <button className="ghost-button" onClick={props.onClose} type="button">
              Close
            </button>
          </div>
        </div>
        {qr ? <img alt={`${props.target.label} QR code`} src={qr} /> : <p>Generating QR...</p>}
        <textarea className="preview-box" readOnly rows={5} value={props.target.value} />
        <div className="toolbar-actions">
          <button
            className="primary-button"
            onClick={() => void copyText(props.target.value)}
            type="button"
          >
            Copy payload
          </button>
        </div>
      </div>
    </div>
  );
}
