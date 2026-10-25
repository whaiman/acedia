const add = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** Dates are relative to `today`, so call this from an event handler, not during render. */
export function exampleScenarios(today: Date) {
  return [
    {
      label: "Ship a project",
      text: [
        `Publish the write-up by ${add(today, 5)} after record demo and README`,
        `Record a 2-minute demo after core feature works`,
        `Write README after core feature works`,
        `Build the core feature by ${add(today, 4)}`,
        `Set up the repository`,
      ].join("\n"),
    },
    {
      label: "Mixed week",
      text: [
        `File expense report by ${add(today, 1)}`,
        `Reply to landlord by ${add(today, 10)}`,
        `Renew passport`,
        `Plan team offsite by ${add(today, 20)}`,
      ].join("\n"),
    },
  ];
}
