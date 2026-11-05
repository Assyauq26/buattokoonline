"""Durable installer checkpoints; public output is an explicit secret-free projection."""
from contextlib import contextmanager
import time

PHASES = [
    ('verify', 'Memverifikasi domain dan HTTPS'),
    ('prepare', 'Memeriksa Docker dan konfigurasi aplikasi'),
    ('build', 'Membangun aplikasi Next.js'),
    ('database', 'Mengaktifkan PostgreSQL'),
    ('migrations', 'Menyiapkan struktur database / migrasi'),
    ('administrator', 'Membuat akun administrator'),
    ('activate', 'Mengaktifkan storefront dan dashboard'),
    ('health', 'Memeriksa kesehatan aplikasi serta HTTPS'),
    ('finish', 'Menyelesaikan konfigurasi toko'),
]
RECOVERY = 'Lanjutkan finalisasi dengan email yang sama. Jika admin belum dibuat, masukkan kembali password. Data dan checkpoint yang selesai dipertahankan.'


def interrupt(state):
    """A restarted service never claims an orphaned operation is still running."""
    progress = state.get('progress')
    if progress and not state.get('complete'):
        for phase in progress.get('phases', []):
            if phase.get('status') == 'running':
                phase.update(status='failed', failure='interrupted', ended_at=int(time.time()))
                state['message'] = 'Proses sebelumnya terputus. ' + RECOVERY


def public(value):
    if not isinstance(value, dict):
        return None
    rows = {row.get('id'): row for row in value.get('phases', []) if isinstance(row, dict)}
    phases = []
    for key, label in PHASES:
        row = rows.get(key, {})
        status = row.get('status')
        phase = {'id': key, 'label': label, 'status': status if status in ['pending', 'running', 'completed', 'failed'] else 'pending'}
        for field in ['started_at', 'ended_at']:
            if type(row.get(field)) is int:
                phase[field] = row[field]
        if phase['status'] == 'failed':
            phase['message'] = 'Proses terputus.' if row.get('failure') == 'interrupted' else 'Tahap ini belum berhasil.'
        phases.append(phase)
    return {'phases': phases, 'completed': sum(row['status'] == 'completed' for row in phases), 'total': len(PHASES),
            'recovery': RECOVERY if any(row['status'] == 'failed' for row in phases) else None}


class Tracker:
    def __init__(self, state, save):
        self.state, self.save = state, save

    def begin(self):
        previous = public(self.state.get('progress'))
        rows = previous['phases'] if previous else [{'id': key, 'status': 'pending'} for key, _ in PHASES]
        self.state['progress'] = {'phases': [{'id': row['id'], 'status': 'completed' if row['status'] == 'completed' else 'pending',
                                            **({'ended_at': row['ended_at']} if row.get('ended_at') else {})} for row in rows]}
        self.save()

    @contextmanager
    def phase(self, key):
        row = next(row for row in self.state['progress']['phases'] if row['id'] == key)
        row.update(status='running', started_at=int(time.time()))
        row.pop('ended_at', None)
        row.pop('failure', None)
        self.save()
        try:
            yield
        except BaseException:
            row.update(status='failed', failure='operation', ended_at=int(time.time()))
            self.save()
            raise
        else:
            row.update(status='completed', ended_at=int(time.time()))
            self.save()
