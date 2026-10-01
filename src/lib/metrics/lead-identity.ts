export type LeadIdentityRecord = {
  id: string;
  email?: string | null;
  phone?: string | null;
};

export function normalizedLeadIdentity(record: LeadIdentityRecord) {
  const email = String(record.email ?? "").trim().toLowerCase();
  let phoneDigits = String(record.phone ?? "").replace(/\D/g, "");
  if(phoneDigits.startsWith("0032"))phoneDigits="0"+phoneDigits.slice(4);
  else if(phoneDigits.startsWith("32")&&phoneDigits.length>=10)phoneDigits="0"+phoneDigits.slice(2);
  return { email, phone: phoneDigits.length >= 8 ? phoneDigits : "" };
}

/** Exact email/phone connected components. Names are intentionally excluded. */
export function groupByStableLeadIdentity<T extends LeadIdentityRecord>(records: T[]) {
  type Group = { records: T[]; emails: Set<string>; phones: Set<string> };
  const groups: Group[] = [];

  for (const record of records) {
    const keys = normalizedLeadIdentity(record);
    const matches = groups.filter(group => Boolean(
      (keys.email && group.emails.has(keys.email))
      || (keys.phone && group.phones.has(keys.phone)),
    ));
    const target = matches[0] ?? { records: [], emails: new Set<string>(), phones: new Set<string>() };
    if (matches.length === 0) groups.push(target);
    for (const duplicate of matches.slice(1)) {
      target.records.push(...duplicate.records);
      duplicate.emails.forEach(value => target.emails.add(value));
      duplicate.phones.forEach(value => target.phones.add(value));
      groups.splice(groups.indexOf(duplicate), 1);
    }
    target.records.push(record);
    if (keys.email) target.emails.add(keys.email);
    if (keys.phone) target.phones.add(keys.phone);
  }
  return groups.map(group => group.records);
}

export function duplicateLeadRowCount(records: LeadIdentityRecord[]) {
  return records.length - groupByStableLeadIdentity(records).length;
}
