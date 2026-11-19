import { RECRUIT_CHARACTERS } from "./characters.js";
import { createRunCharacterState } from "./progression.js";

export const MAX_PARTY_MEMBERS = 3;

export function migrateLegacyParty(campaign) {
  if (!campaign?.partyIds || campaign.partyIds.length <= MAX_PARTY_MEMBERS) return false;
  const excess = campaign.partyIds.slice(MAX_PARTY_MEMBERS);
  const incomingId = excess.at(-1);
  (campaign.reservePartyIds ??= []).push(...excess.slice(0, -1));
  campaign.partyIds = campaign.partyIds.slice(0, MAX_PARTY_MEMBERS);
  campaign.pendingRecruitment = { characterId: incomingId, sourceId: "legacy-four-member-save",
    resumeStatus: campaign.status };
  campaign.status = "party_replacement";
  campaign.combatLaunched = false;
  return true;
}

export function recruitPartyMember(campaign, characterId, sourceId, replaceId = null) {
  if (!campaign?.partyIds || campaign.partyIds.includes(characterId)) return false;
  const template = RECRUIT_CHARACTERS.find((character) => character.id === characterId);
  if (!template) return false;
  const full = campaign.partyIds.length >= MAX_PARTY_MEMBERS;
  if (full && (!replaceId || replaceId === campaign.playerId || !campaign.partyIds.includes(replaceId))) return false;
  if (!full && replaceId) return false;
  const state = campaign.partyStates[characterId] ?? createRunCharacterState(template);
  if (full) {
    const index = campaign.partyIds.indexOf(replaceId);
    // Keep the outgoing member's whole state in the save. There is no existing
    // equipment return or re-recruitment rule, so do not destroy their items.
    campaign.reservePartyIds ??= [];
    if (!campaign.reservePartyIds.includes(replaceId)) campaign.reservePartyIds.push(replaceId);
    campaign.partyIds.splice(index, 1, characterId);
  } else campaign.partyIds.push(characterId);
  campaign.reservePartyIds = (campaign.reservePartyIds ?? []).filter((id) => id !== characterId);
  campaign.partyStates[characterId] = state;
  campaign.partyRecruitments ??= [];
  campaign.partyRecruitments.push({ characterId, replacedId: replaceId, sourceId, stageId: campaign.stageId });
  return state;
}
