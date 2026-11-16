import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash } from '@phosphor-icons/react';
import type { MasterDataRecordDto, MasterDataTypeDto } from '@ravand/shared';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { DynamicFields, useMasterOptions } from '@/components/DynamicFields';
import { Button, Modal } from '@/components/ui';

function initialValues(type: MasterDataTypeDto): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of type.fields) {
    if (field.key === 'active' && field.type === 'checkbox') values[field.key] = true;
    if (field.key === 'kind' && field.type === 'select') values[field.key] = 'supplier';
  }
  return values;
}

export function RecordModal({
  open,
  type,
  record,
  onClose,
  onDeleted,
}: {
  open: boolean;
  type: MasterDataTypeDto;
  record: MasterDataRecordDto | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const masterOptions = useMasterOptions();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setConfirmDelete(false);
    setValues(record ? { ...record.data } : initialValues(type));
  }, [open, record, type]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['master-records', type.id] });
    void queryClient.invalidateQueries({ queryKey: ['master-types'] });
    void queryClient.invalidateQueries({ queryKey: ['master-options'] });
  };

  const save = useMutation({
    mutationFn: () =>
      record
        ? api.patch<MasterDataRecordDto>(
            `/master/types/${type.id}/records/${record.id}`,
            { data: values },
          )
        : api.post<MasterDataRecordDto>(`/master/types/${type.id}/records`, { data: values }),
    onSuccess: () => {
      refresh();
      toast.success(record ? 'رکورد به‌روز شد.' : 'رکورد ثبت شد.');
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/master/types/${type.id}/records/${record?.id}`),
    onSuccess: () => {
      refresh();
      toast.success('رکورد حذف شد.');
      onDeleted?.();
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const isCustom = type.entity === 'custom';

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={record ? `ویرایش ${record.title}` : `رکورد جدید — ${type.name}`}
        description={
          isCustom
            ? `پارامترهای این رکورد را پر کنید.`
            : `این رکورد در ${type.name} ثبت می‌شود و بلافاصله در انتخابگرهای فرم‌ها دیده می‌شود.`
        }
        size="lg"
        footer={
          <>
            {record ? (
              <Button
                variant="ghost"
                className="me-auto text-stamp-600 hover:bg-stamp-50"
                icon={<Trash size={14} />}
                onClick={() => setConfirmDelete(true)}
              >
                حذف
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              انصراف
            </Button>
            <Button variant="ink" loading={save.isPending} onClick={() => save.mutate()}>
              ذخیره رکورد
            </Button>
          </>
        }
      >
        <DynamicFields
          fields={type.fields}
          values={values}
          onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
          options={masterOptions.data}
        />
        {error ? (
          <p className="mt-3 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
            {error}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="حذف رکورد"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              انصراف
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              حذف
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-ink-600">
          «{record?.title}» حذف شود؟ اگر این رکورد در داده‌های دیگر استفاده شده باشد، حذف انجام
          نمی‌شود.
        </p>
      </Modal>
    </>
  );
}
