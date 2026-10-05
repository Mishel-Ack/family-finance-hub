import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MemberFilter({
  members,
  value,
  selectedFormerName,
  onChange,
}: {
  members: Array<{ id: string; display_name: string }>;
  value?: string | undefined;
  selectedFormerName?: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const selectedIsCurrent = members.some((member) => member.id === value);
  return (
    <Select value={value ?? "ALL"} onValueChange={(id) => onChange(id === "ALL" ? undefined : id)}>
      <SelectTrigger aria-label="Filter by family member">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All members</SelectItem>
        {members.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            {member.display_name}
          </SelectItem>
        ))}
        {value && !selectedIsCurrent ? (
          <SelectItem value={value}>{selectedFormerName ?? "Former member"}</SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}
