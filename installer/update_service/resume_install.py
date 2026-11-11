"""Resume only an interrupted new-install finalization from installed root code."""
import os
import core


def resume():
    if os.geteuid() != 0:
        raise core.StoreError('Operator diperlukan.')
    state = core.read_json(core.STATE)
    if state.get('complete') or not state.get('store_ready'):
        return
    core.run(['systemctl', 'stop', 'single-store-setup.service'])
    core.finish_installation(state)
    core.run(['systemctl', 'disable', 'single-store-setup.service'])


if __name__ == '__main__':
    try:
        resume()
    except Exception:
        raise SystemExit('Finalisasi updater belum selesai. Data toko dipertahankan; periksa pemulihan operator.') from None
