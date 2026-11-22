import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useClient } from '../engine/useGame';
import type { Snapshot, StaffView, UpgradeView } from '../engine/types';
import { Bar } from './Bar';
import { Button } from './Button';
import { C, R } from './theme';

export type ShopTab = 'upgrades' | 'staff' | 'goals' | 'album';
const TABS: { id: ShopTab; label: string }[] = [
  { id: 'upgrades', label: 'Upgrades' }, { id: 'staff', label: 'Staff' }, { id: 'goals', label: 'Goals' }, { id: 'album', label: 'Album' },
];
const ROLE_LABEL: Record<string, string> = { SERVER: 'Server', CLEANER: 'Cleaner', COOK: 'Assistant cook', RIDER: 'Delivery rider' };

/** Grow the lomihan: buy upgrades, hire and train helpers, check goals and the achievement album. */
export function ShopScreen({ s, tab: initial, onClose }: { s: Snapshot; tab: ShopTab; onClose: () => void }) {
  const [tab, setTab] = useState<ShopTab>(initial);
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title}>Lomihan ni Mang Kaloy</Text>
          <View style={styles.money}><Text style={styles.moneyText}>₱{Math.floor(s.money)}</Text></View>
        </View>
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.id} testID={`tab-${t.id}`} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }}
              style={[styles.tab, tab === t.id ? { backgroundColor: C.red } : null]}>
              <Text style={[styles.tabText, tab === t.id ? { color: C.white } : null]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
          {tab === 'upgrades' ? s.upgrades.map((u) => <UpgradeCard key={u.id} u={u} level={s.progress.level} />) : null}
          {tab === 'staff' ? s.staff.map((w) => <StaffCard key={w.id} w={w} level={s.progress.level} />) : null}
          {tab === 'goals' ? <Goals s={s} /> : null}
          {tab === 'album' ? <Album s={s} /> : null}
        </ScrollView>
        <Button testID="shop-close" label="Back to the lomihan" tone="green" onPress={onClose} />
      </View>
    </View>
  );
}

function Pips({ n, max }: { n: number; max: number }) {
  return <View style={{ flexDirection: 'row', gap: 4 }}>{Array.from({ length: max }, (_, i) => <View key={i} style={[styles.pip, i < n ? { backgroundColor: C.yellow } : null]} />)}</View>;
}

function UpgradeCard({ u, level }: { u: UpgradeView; level: number }) {
  const client = useClient();
  const locked = !u.unlocked;
  return (
    <View style={[styles.card, locked ? { opacity: 0.6 } : null]}>
      <View style={styles.cardHead}>
        <Text style={styles.name}>{u.name}</Text>
        <Pips n={u.level} max={u.maxLevel} />
      </View>
      <Text style={styles.desc}>{u.description}</Text>
      {u.level > 0 ? <Text style={styles.now}>Now: {u.effectNow}</Text> : null}
      {!u.maxed ? <Text style={styles.next}>Next: {u.effectNext}</Text> : <Text style={styles.now}>Maxed out!</Text>}
      {!u.maxed ? (
        locked ? <Text style={styles.lock}>Unlocks at level {u.unlockLevel} (you're level {level})</Text>
          : <Button testID={`buy-up-${u.id}`} tone="yellow" label={`Buy  ₱${u.nextCost}`} disabled={!u.canBuy} onPress={() => client.send({ cmd: 'buyUpgrade', id: u.id })} />
      ) : null}
    </View>
  );
}

function StaffCard({ w, level }: { w: StaffView; level: number }) {
  const client = useClient();
  const locked = !w.unlocked;
  return (
    <View style={[styles.card, locked ? { opacity: 0.6 } : null]}>
      <View style={styles.cardHead}>
        <View>
          <Text style={styles.name}>{w.name}</Text>
          <Text style={styles.desc}>{ROLE_LABEL[w.role]} · {w.job}</Text>
        </View>
        {w.hired ? <Pips n={w.level} max={w.maxLevel} /> : null}
      </View>
      {w.hired ? (
        <>
          <Text style={styles.now}>{w.resting ? 'Resting' : w.activity}</Text>
          {w.role === 'COOK' && (w.progress ?? 0) > 0 ? <Bar value={w.progress ?? 0} color={C.orange} height={8} /> : null}
          <Text style={styles.desc}>Wage: ₱{w.wage} per day</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {w.level < w.maxLevel ? <Button testID={`train-${w.id}`} style={{ flex: 1 }} small tone="yellow" label={`Train  ₱${w.trainCost}`} disabled={!w.canTrain} onPress={() => client.send({ cmd: 'train', id: w.id })} /> : <Text style={[styles.now, { flex: 1 }]}>Fully trained</Text>}
            <Button small tone="cream" label={w.resting ? 'Back to work' : 'Let rest'} onPress={() => client.send({ cmd: 'rest', id: w.id, resting: !w.resting })} />
          </View>
        </>
      ) : locked ? <Text style={styles.lock}>Can be hired at level {w.unlockLevel} (you're level {level})</Text>
        : (
          <>
            <Text style={styles.desc}>Wage: ₱{w.wage} per day, paid at closing</Text>
            <Button testID={`hire-${w.id}`} tone="green" label={`Hire  ₱${w.hireCost}`} disabled={!w.canHire} onPress={() => client.send({ cmd: 'hire', id: w.id })} />
          </>
        )}
    </View>
  );
}

function Goals({ s }: { s: Snapshot }) {
  const p = s.progress;
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.name}>Level {p.level}{p.level >= p.maxLevel ? ' (max!)' : ''}</Text>
        <Bar value={p.xp} max={p.xpToNext} color={C.yellow} height={14} />
        <Text style={styles.desc}>{p.xp} / {p.xpToNext} XP · Best Sarap streak: {p.bestStreak} · Customers served: {p.totalServed}</Text>
        {p.nextUnlocks.length ? <Text style={styles.next}>Next level unlocks: {p.nextUnlocks.join(' · ')}</Text> : null}
      </View>
      <Text style={styles.section}>Today's goals</Text>
      {s.goals.map((g) => (
        <View key={g.id} style={[styles.card, g.done ? { backgroundColor: '#E6F7E9' } : null]}>
          <View style={styles.cardHead}>
            <Text style={styles.name}>{g.done ? '✓ ' : ''}{g.title}</Text>
            <Text style={styles.reward}>₱{g.rewardMoney} · {g.rewardXp} XP</Text>
          </View>
          <Bar value={g.progress} max={g.target} color={g.done ? C.green : C.teal} height={10} />
          <Text style={styles.desc}>{g.progress} / {g.target}</Text>
        </View>
      ))}
    </>
  );
}

function Album({ s }: { s: Snapshot }) {
  const done = s.achievements.filter((a) => a.done).length;
  return (
    <>
      <Text style={styles.section}>Collected {done} of {s.achievements.length}</Text>
      <View style={styles.grid}>
        {s.achievements.map((a) => (
          <View key={a.id} style={[styles.badge, a.done ? { backgroundColor: C.yellow } : null]} accessibilityLabel={`${a.title}: ${a.description}${a.done ? ', done' : ''}`}>
            <Text style={[styles.badgeTitle, !a.done ? { opacity: 0.5 } : null]}>{a.done ? a.title : '???'}</Text>
            <Text style={styles.badgeDesc}>{a.description}</Text>
            <Text style={styles.badgeReward}>₱{a.reward}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.shade, justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', backgroundColor: C.pink, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderWidth: 3, borderColor: C.brown, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.brown, fontWeight: '900', fontSize: 20 },
  money: { backgroundColor: C.yellow, borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, paddingHorizontal: 10, paddingVertical: 5 },
  moneyText: { color: C.brown, fontWeight: '900', fontSize: 17 },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, minHeight: 44, borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: C.brown, fontWeight: '900', fontSize: 14 },
  card: { backgroundColor: C.cream, borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, padding: 12, gap: 6 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { color: C.brown, fontWeight: '900', fontSize: 16, flexShrink: 1 },
  desc: { color: C.brownSoft, fontWeight: '700', fontSize: 13 },
  now: { color: C.greenDark, fontWeight: '800', fontSize: 13 },
  next: { color: C.brown, fontWeight: '800', fontSize: 13 },
  lock: { color: C.redDark, fontWeight: '800', fontSize: 13 },
  reward: { color: C.yellowDark, fontWeight: '900', fontSize: 13 },
  section: { color: C.brown, fontWeight: '900', fontSize: 16, marginTop: 4 },
  pip: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.brown, backgroundColor: C.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { width: '48%', backgroundColor: C.cream, borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, padding: 10, gap: 2 },
  badgeTitle: { color: C.brown, fontWeight: '900', fontSize: 14 },
  badgeDesc: { color: C.brownSoft, fontSize: 12, fontWeight: '700' },
  badgeReward: { color: C.yellowDark, fontWeight: '900', fontSize: 12 },
});
