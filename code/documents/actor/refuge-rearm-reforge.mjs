/** Apply complete Rearm and Reforge choices on the GM's client. */
export default class RefugeRearmReforge {
  /** Apply the selected replacements after resolving their documents. */
  static async apply(hunter, action, choice) {
    if (action === "removeEcho") {
      const echo = hunter.items.get(choice.echoId);
      if (!echo) throw new Error(game.i18n.localize("HOLLOWS.REFUGE.missingSelectedItem"));
      await hunter.deleteEmbeddedDocuments("Item", [echo.id]);
      return;
    }
    const weapons = await Promise.all(choice.weapons.map(async pick => ({
      ...pick, old: hunter.items.get(pick.id), template: pick.uuid ? await fromUuid(pick.uuid) : null,
      form: pick.formUuid ? await fromUuid(pick.formUuid) : null,
    })));
    const abilities = await Promise.all(choice.abilities.map(async pick => ({
      ...pick, old: hunter.items.get(pick.id), template: await fromUuid(pick.uuid),
    })));
    if (weapons.some(pick => !pick.old || (pick.uuid && !pick.template) || (pick.formUuid && !pick.form))
      || abilities.some(pick => !pick.old || !pick.template || !hunter.items.has(pick.weaponId))) {
      throw new Error(game.i18n.localize("HOLLOWS.REFUGE.missingSelectedItem"));
    }

    const updates = weapons.map(pick => {
      const weapon = pick.template || pick.old;
      const system = weapon.system.toObject();
      system.renown = pick.old.system.toObject().renown;
      system.modifierChoice = pick.modifierChoice;
      system.appliedForm = pick.form ? {
        ...pick.form.system.toObject(), uuid: pick.form.uuid, name: pick.form.name,
        attackProfileVariant: pick.variant,
      } : null;
      system.capacity.value = 0;
      const update = {
        _id: pick.id, name: weapon.name, img: weapon.img, system,
      };
      if (pick.template) update["_stats.compendiumSource"] = pick.template.uuid;
      return update;
    });
    updates.push(...abilities.map(pick => ({
      _id: pick.id, name: pick.template.name, img: pick.template.img,
      "_stats.compendiumSource": pick.template.uuid,
      system: {
        ...pick.template.system.toObject(),
        durationType: pick.old.system.durationType, boundWeaponId: pick.weaponId,
      },
    })));
    await hunter.updateEmbeddedDocuments("Item", updates);
    if (action === "reshape") await hunter.update({ "system.stats": choice.stats });
  }
}
