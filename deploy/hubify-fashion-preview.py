"""Private Hubify app-only pilot. This entry point cannot install on another store."""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'installer'))
import core
import promotions_cutover as official
from midtrans_patch_cutover import Native as Schema35
from update_service.runtime import install


class FashionPreview(Schema35):
    base_sha = '8fb8607deb6a6a337cd69c78d0e2f7f6083193ad'
    base_digest = '08069cba664e4cacc03ceec4af3331b60398bc6fd0bcb9a54dec0e5e15036af7'
    base_image = 'sha256:9c015a32567073e83691a8dc0934f240fb8271af82355715ab1a22f2580e06f6'
    base_tree = '7feab14b10cd70087f71ef63e1a0f6fa826fef08'
    target_tree = '786a4e32da894cefa97a9cd57c25ee6bd94c6d36'
    baseline_version = '1.9.1'
    journal_name = 'hubify-fashion-preview.json'
    previous_receipt = 'hubify-midtrans-patch-cutover.json'
    release_prefix = 'hubify-fashion-preview-'
    deployment_name = 'hubify-fashion-preview'

    def __init__(self, repository, archive, digest, sha, baseline):
        super().__init__(repository, archive, digest, sha, baseline)
        official.check(core.run(['git', '-C', self.repository, 'rev-parse', sha + ':app']) == self.target_tree,
                       'exact reviewed fashion application required')
        for path in ('app/prisma/schema.prisma', 'app/Dockerfile', 'app/package.json', 'app/package-lock.json'):
            official.check(self.files[path] == self.old_files[path], 'changed baseline contract: '+path)

    def file_guards(self):
        from promotions_transition import digest
        result = super().file_guards()
        path = core.CONFIG / self.previous_receipt
        result[str(path)] = digest(path.read_bytes())
        return result


class FashionCorrection(FashionPreview):
    """Exact app-only continuation of the first private fashion deployment."""
    base_sha = '2d1e047e5c54a4cf2533f23a71e71a4d189cb820'
    base_digest = '3ca761e187d4660fddcbc3f922f71d38804ee0f1b1685c0866a88fd0d4c0b9c1'
    base_image = 'sha256:c4a2e53bc2f4aa2ebe780c9771e9a3a0b811520b669bbb6f1a4a7698679aa258'
    base_tree = FashionPreview.target_tree
    target_tree = 'abe32a103ada3d82835b1baebd7da53a5f32ef6b'
    previous_receipt = FashionPreview.journal_name
    journal_name = 'hubify-fashion-cylinder.json'
    release_prefix = 'hubify-fashion-cylinder-'
    deployment_name = 'hubify-fashion-cylinder'

    def file_guards(self):
        from promotions_transition import digest
        result = super().file_guards()
        path = core.CONFIG / FashionPreview.previous_receipt
        result[str(path)] = digest(path.read_bytes())
        return result


class FashionFiveCard(FashionCorrection):
    """App-only continuation pinned to the previous carousel deployment."""
    base_sha = '4172d7b3316dcec03015053345b4dd5b25d76f3b'
    base_digest = 'cc123280922f554a44d03b601d7ea2c24b91b02ccb7870e378741ffb6d0a9c7d'
    base_image = 'sha256:ff2d36a6f059eb939cf63ae94520cc3af72744093cd215f554b2b8b77b8e33c1'
    base_tree = FashionCorrection.target_tree
    target_tree = 'cdeba054e2bda7e55bc25f7068601fbbca2dc4c2'
    previous_receipt = FashionCorrection.journal_name
    journal_name = 'hubify-fashion-five-card.json'
    release_prefix = 'hubify-fashion-five-card-'
    deployment_name = 'hubify-fashion-five-card'

    def file_guards(self):
        from promotions_transition import digest
        result = super().file_guards()
        path = core.CONFIG / FashionCorrection.previous_receipt
        result[str(path)] = digest(path.read_bytes())
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['dry-run', 'apply', 'reconcile'])
    parser.add_argument('sha')
    parser.add_argument('digest')
    parser.add_argument('--external-work-stopped', action='store_true')
    target = parser.add_mutually_exclusive_group()
    target.add_argument('--five-card', action='store_true', help='Deploy five-card composition over the reviewed cylinder baseline')
    target.add_argument('--correction', action='store_true', help='Apply the carousel correction to the exact private preview baseline')
    args = parser.parse_args()
    install()
    os.umask(0o077)
    folder = core.ROOT / 'operator-packages'
    driver_type = FashionFiveCard if args.five_card else FashionCorrection if args.correction else FashionPreview
    baseline = ('fashion-' + driver_type.base_sha + '.tar.gz') if driver_type != FashionPreview else 'store-v1.9.1-8fb8607deb6a.tar.gz'
    driver = driver_type(ROOT, folder / ('fashion-' + args.sha + '.tar.gz'), args.digest, args.sha, folder / baseline)
    official.check(not args.external_work_stopped or args.mode == 'reconcile', 'reconciliation only')
    driver.external_work_stopped = args.external_work_stopped
    runner = official.Cutover(driver)
    if args.mode == 'dry-run':
        result = runner.dry_run()
        print(json.dumps({key: result[key] for key in ('transition_accepted','before_migrations','after_migrations','production_mutations')}))
        return
    with official.operation_lock():
        result = runner.apply() if args.mode == 'apply' else runner.reconcile()
    print(json.dumps({key:result.get(key) for key in ('phase','sha','digest','image','backup_verified')}))


if __name__ == '__main__':
    main()
