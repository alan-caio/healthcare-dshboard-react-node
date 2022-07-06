import {
  CpuLoad,
  GpuLoad,
  NetworkLoad,
  RamLoad,
  StorageLoad,
} from '@dash/common';
import { exec as cexec } from 'child_process';
import { interval, mergeMap, Observable, ReplaySubject } from 'rxjs';
import * as si from 'systeminformation';
import { inspect, promisify } from 'util';
import { CONFIG } from './config';
import { NET_INTERFACE_PATH } from './setup';
import { getStaticServerInfo, runSpeedTest } from './static-info';

const exec = promisify(cexec);

const createBufferedInterval = <R>(
  name: string,
  enabled: boolean,
  bufferSize: number,
  intervalMs: number,
  factory: () => Promise<R>
): Observable<R> => {
  const buffer = new ReplaySubject<R>(bufferSize);

  if (enabled) {
    // Instantly load first value
    factory()
      .then(value => {
        console.log(
          `First measurement [${name}]:`,
          inspect(value, {
            showHidden: false,
            depth: null,
            colors: true,
          })
        );

        buffer.next(value);
      })
      .catch(err => buffer.error(err));

    // Load values every intervalMs
    interval(intervalMs).pipe(mergeMap(factory)).subscribe(buffer);

    return buffer.asObservable();
  }

  return new Observable();
};

export const getDynamicServerInfo = () => {
  const cpuObs = createBufferedInterval(
    'CPU',
    CONFIG.widget_list.includes('cpu'),
    CONFIG.cpu_shown_datapoints,
    CONFIG.cpu_poll_interval,
    async (): Promise<CpuLoad> => {
      const staticInfo = await getStaticServerInfo();
      const loads = (await si.currentLoad()).cpus;

      let temps: si.Systeminformation.CpuTemperatureData['cores'] = [];
      let mainTemp = 0;
      if (CONFIG.enable_cpu_temps) {
        const siTemps = await si.cpuTemperature();
        const threadsPerCore = staticInfo.cpu.threads / staticInfo.cpu.cores;
        temps = siTemps.cores.flatMap(temp => Array(threadsPerCore).fill(temp));
        mainTemp = siTemps.main; // AVG temp of all cores, in case no per-core data is found
      }

      return loads.map(({ load }, i) => ({
        load,
        temp: temps[i] ?? mainTemp,
        core: i,
      }));
    }
  );

  const ramObs = createBufferedInterval(
    'RAM',
    CONFIG.widget_list.includes('ram'),
    CONFIG.ram_shown_datapoints,
    CONFIG.ram_poll_interval,
    async (): Promise<RamLoad> => {
      return (await si.mem()).active;
    }
  );

  const INVALID_FS_TYPES = [
    'cifs',
    '9p',
    'fuse.rclone',
    'fuse.mergerfs',
  ].concat(CONFIG.fs_type_filter);

  const storageObs = createBufferedInterval(
    'Storage',
    CONFIG.widget_list.includes('storage'),
    1,
    CONFIG.storage_poll_interval,
    async (): Promise<StorageLoad> => {
      const [
        layout,
        // blocks, sizes
      ] = await Promise.all([
        getStaticServerInfo(),
        // si.blockDevices(),
        // si.fsSize(),
      ]);

      const sizes = [
        {
          fs: 'overlay',
          type: 'overlay',
          size: 489289572352,
          used: 211411542016,
          available: 257381662720,
          use: 45.1,
          mount: '/',
        },
        {
          fs: '/dev/mapper/ubuntu--vg-ubuntu--lv',
          type: 'ext4',
          size: 489289572352,
          used: 211411542016,
          available: 257381662720,
          use: 45.1,
          mount: '/mnt/host',
        },
        {
          fs: '/dev/sdb2',
          type: 'ext4',
          size: 1551745024,
          used: 220078080,
          available: 1234362368,
          use: 15.13,
          mount: '/mnt/host/boot',
        },
        {
          fs: '/dev/sdb1',
          type: 'vfat',
          size: 1124999168,
          used: 5484544,
          available: 1119514624,
          use: 0.49,
          mount: '/mnt/host/boot/efi',
        },
        {
          fs: '/dev/loop0',
          type: 'squashfs',
          size: 65011712,
          used: 65011712,
          available: 0,
          use: 100,
          mount: '/mnt/host/snap/core20/1494',
        },
        {
          fs: '/dev/loop1',
          type: 'squashfs',
          size: 65011712,
          used: 65011712,
          available: 0,
          use: 100,
          mount: '/mnt/host/snap/core20/1518',
        },
        {
          fs: '/dev/loop2',
          type: 'squashfs',
          size: 70516736,
          used: 70516736,
          available: 0,
          use: 100,
          mount: '/mnt/host/snap/lxd/21835',
        },
        {
          fs: '/dev/loop4',
          type: 'squashfs',
          size: 71172096,
          used: 71172096,
          available: 0,
          use: 100,
          mount: '/mnt/host/snap/lxd/22753',
        },
        {
          fs: '/dev/loop5',
          type: 'squashfs',
          size: 49283072,
          used: 49283072,
          available: 0,
          use: 100,
          mount: '/mnt/host/snap/snapd/16010',
        },
        {
          fs: '/dev/sda1',
          type: 'xfs',
          size: 1999421038592,
          used: 76902424576,
          available: 1922518614016,
          use: 3.85,
          mount: '/mnt/host/data',
        },
        {
          fs: 'Local:mount',
          type: 'fuse.mergerfs',
          size: 1168033936314368,
          used: 41856151441408,
          available: 1126157288505344,
          use: 3.58,
          mount: '/mnt/host/gmedia',
        },
        {
          fs: 'gcrypt:',
          type: 'fuse.rclone',
          size: 1167544646742016,
          used: 41644739899392,
          available: 1125899906842624,
          use: 3.57,
          mount: '/mnt/host/mnt/GDmount',
        },
        {
          fs: '/dev/loop6',
          type: 'squashfs',
          size: 49283072,
          used: 49283072,
          available: 0,
          use: 100,
          mount: '/mnt/host/snap/snapd/16292',
        },
      ];
      const blocks = [
        {
          name: 'sda',
          type: 'disk',
          fsType: '',
          mount: '',
          size: 2000398934016,
          physical: 'HDD',
          uuid: '',
          label: '',
          model: 'WDC WD20EARS-00J',
          serial: '',
          removable: false,
          protocol: 'sata',
          group: undefined,
        },
        {
          name: 'sdb',
          type: 'disk',
          fsType: '',
          mount: '',
          size: 500107862016,
          physical: 'SSD',
          uuid: '',
          label: '',
          model: 'CT500MX500SSD1  ',
          serial: '',
          removable: false,
          protocol: 'sata',
          group: undefined,
        },
        {
          name: 'loop0',
          type: 'loop',
          fsType: 'squashfs',
          mount: '/mnt/host/snap/core20/1494',
          size: 64925696,
          physical: '',
          uuid: '',
          label: '',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'loop1',
          type: 'loop',
          fsType: 'squashfs',
          mount: '/mnt/host/snap/core20/1518',
          size: 64933888,
          physical: '',
          uuid: '',
          label: '',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'loop2',
          type: 'loop',
          fsType: 'squashfs',
          mount: '/mnt/host/snap/lxd/21835',
          size: 70508544,
          physical: '',
          uuid: '',
          label: '',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'loop4',
          type: 'loop',
          fsType: 'squashfs',
          mount: '/mnt/host/snap/lxd/22753',
          size: 71106560,
          physical: '',
          uuid: '',
          label: '',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'loop5',
          type: 'loop',
          fsType: 'squashfs',
          mount: '/mnt/host/snap/snapd/16010',
          size: 49233920,
          physical: '',
          uuid: '',
          label: '',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'loop6',
          type: 'loop',
          fsType: 'squashfs',
          mount: '/mnt/host/snap/snapd/16292',
          size: 49242112,
          physical: '',
          uuid: '',
          label: '',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'sda1',
          type: 'part',
          fsType: 'xfs',
          mount: '/mnt/host/data',
          size: 2000397795328,
          physical: '',
          uuid: '80113b64-3c84-4f12-b998-85f7075d1ff8',
          label: 'Data',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'sdb1',
          type: 'part',
          fsType: 'vfat',
          mount: '/mnt/host/boot/efi',
          size: 1127219200,
          physical: '',
          uuid: '0A87-BDCA',
          label: '',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'sdb2',
          type: 'part',
          fsType: 'ext4',
          mount: '/mnt/host/boot',
          size: 1610612736,
          physical: '',
          uuid: '803cb74d-55b5-4723-9c13-336f560ac573',
          label: '',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'sdb3',
          type: 'part',
          fsType: 'LVM2_member',
          mount: '',
          size: 497368964608,
          physical: '',
          uuid: 'yhdXqH-9zLI-MXik-HkGv-1OZq-wOCy-GlbnJ2',
          label: '',
          model: '',
          serial: '',
          removable: false,
          protocol: '',
          group: undefined,
        },
        {
          name: 'sr0',
          type: 'rom',
          fsType: '',
          mount: '',
          size: 1073741312,
          physical: 'CD/DVD',
          uuid: '',
          label: '',
          model: 'DVDRAM GHC0N    ',
          serial: '',
          removable: true,
          protocol: 'sata',
          group: undefined,
        },
      ];

      const storageLayout = layout.storage.layout;
      const validMounts = sizes.filter(
        ({ mount, type }) =>
          mount.startsWith('/mnt/host/') && !INVALID_FS_TYPES.includes(type)
      );
      const hostMountUsed =
        sizes.filter(({ mount }) => mount === '/mnt/host' || mount === '/')[0]
          ?.used ?? 0;
      const validParts = blocks.filter(({ type }) => type === 'part');

      let hostFound = false;

      return {
        layout: storageLayout
          .map(({ device }) => {
            const deviceParts = validParts.filter(({ name }) =>
              name.startsWith(device)
            );
            const potentialHost =
              // drives that have all partitions unmounted
              deviceParts.every(
                ({ mount }) => mount == null || !mount.startsWith('/mnt/host/')
              ) ||
              // drives where one of the partitions is mounted to the root or /mnt/host/boot/
              deviceParts.some(
                ({ mount }) =>
                  mount === '/mnt/host' || mount.startsWith('/mnt/host/boot/')
              );

            // Apply all unclaimed partitions to the host disk
            if (potentialHost && !hostFound) {
              hostFound = true;
              const unclaimedSpace = validMounts
                .filter(
                  ({ mount }) => !validParts.some(part => part.mount === mount)
                )
                .reduce((acc, { used }) => acc + used, 0);

              return hostMountUsed + unclaimedSpace;
            }

            return potentialHost
              ? 0
              : deviceParts.reduce(
                  (acc, curr) =>
                    acc +
                    (validMounts.find(({ mount }) => curr.mount === mount)
                      ?.used ?? 0),
                  0
                );
          })
          .map(used => ({
            load: used,
          })),
      };
    }
  );

  let [lastRx, lastTx, lastTs] = [0, 0, 0];

  const networkObs = createBufferedInterval(
    'Network',
    CONFIG.widget_list.includes('network'),
    CONFIG.network_shown_datapoints,
    CONFIG.network_poll_interval,
    async (): Promise<NetworkLoad> => {
      if (NET_INTERFACE_PATH) {
        const { stdout } = await exec(
          `cat ${NET_INTERFACE_PATH}/statistics/rx_bytes;` +
            `cat ${NET_INTERFACE_PATH}/statistics/tx_bytes;`
        );
        const [rx, tx] = stdout.split('\n').map(Number);
        const thisTs = performance.now();
        const dividend = (thisTs - lastTs) / 1000;

        const result =
          lastTs === 0
            ? {
                up: 0,
                down: 0,
              }
            : {
                up: (tx - lastTx) / dividend,
                down: (rx - lastRx) / dividend,
              };

        lastRx = rx;
        lastTx = tx;
        lastTs = thisTs;

        return result;
      } else {
        const data = (await si.networkStats())[0];

        return {
          up: data.tx_sec,
          down: data.rx_sec,
        };
      }
    }
  );

  const gpuObs = createBufferedInterval(
    'GPU',
    CONFIG.widget_list.includes('gpu'),
    CONFIG.gpu_shown_datapoints,
    CONFIG.gpu_poll_interval,
    async (): Promise<GpuLoad> => {
      const info = await si.graphics();

      return {
        layout: info.controllers.map(controller => ({
          load: controller.utilizationGpu ?? 0,
          memory: controller.utilizationMemory ?? 0,
        })),
      };
    }
  );

  const speedTestObs = CONFIG.widget_list.includes('network')
    ? interval(CONFIG.speed_test_interval * 60 * 1000).pipe(
        mergeMap(async () => await runSpeedTest())
      )
    : new Observable();

  return {
    cpu: cpuObs,
    ram: ramObs,
    storage: storageObs,
    network: networkObs,
    gpu: gpuObs,
    speedTest: speedTestObs,
  };
};
