// Sanity-checks a story file so authoring mistakes show up as readable errors
// instead of a broken scene. Returns a list of problems (empty = OK).

export function validateStory(story) {
  const errs = [];
  const chars = story.characters || {};
  const scenes = story.scenes || {};
  if (!scenes[story.start]) errs.push(`start scene "${story.start}" not found`);
  if (!chars[story.player]) errs.push(`player character "${story.player}" not found`);

  const checkSteps = (steps, where, scene) => {
    for (const st of steps || []) {
      if (st.s && st.s !== 'narrator' && !chars[st.s]) errs.push(`${where}: unknown speaker "${st.s}"`);
      if (st.do === 'goto' && !scenes[st.scene]) errs.push(`${where}: goto unknown scene "${st.scene}"`);
      if (st.do === 'wave' && !scene.waves?.[st.id]) errs.push(`${where}: unknown wave "${st.id}"`);
      if (st.do === 'npcAdd' && !chars[st.character || st.id]) errs.push(`${where}: npcAdd unknown character "${st.character || st.id}"`);
      checkSteps(st.then, where, scene);
      checkSteps(st.else, where, scene);
      checkSteps(st.talk, where, scene);
      for (const c of st.choices || []) checkSteps(c.then, where, scene);
    }
  };

  for (const [id, sc] of Object.entries(scenes)) {
    if (sc.playAs && !chars[sc.playAs]) errs.push(`${id}: playAs unknown character "${sc.playAs}"`);
    checkSteps(sc.intro, `${id}.intro`, sc);
    for (const n of sc.npcs || []) {
      if (!chars[n.character || n.id]) errs.push(`${id}: npc unknown character "${n.character || n.id}"`);
      checkSteps(n.talk, `${id}.npc.${n.id}`, sc);
    }
    for (const it of sc.interactables || []) checkSteps(it.script, `${id}.${it.id}`, sc);
    for (const t of sc.triggers || []) checkSteps(t.script, `${id}.trigger`, sc);
    for (const [wid, w] of Object.entries(sc.waves || {})) {
      for (const e of w.enemies) if (!chars[e.character]) errs.push(`${id}.wave.${wid}: unknown enemy "${e.character}"`);
      checkSteps(w.onClear, `${id}.wave.${wid}`, sc);
    }
    for (const e of sc.exits || []) {
      if (!scenes[e.to]) errs.push(`${id}: exit to unknown scene "${e.to}"`);
      else if (e.spawn && !scenes[e.to].spawns?.[e.spawn]) errs.push(`${id}: exit spawn "${e.spawn}" missing in ${e.to}`);
    }
  }
  return errs;
}
