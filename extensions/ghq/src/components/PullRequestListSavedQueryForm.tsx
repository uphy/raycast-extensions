import { useForm } from "@raycast/utils";
import { SavedQuery } from "../model";
import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { randomUUID } from "crypto";

type FormValues = {
  query: string;
  name: string;
};

export function SavedQueryForm(props: {
  title: string;
  initValue: SavedQuery;
  onSubmit: (savedQuery: SavedQuery) => void;
}) {
  const { pop } = useNavigation();
  const { handleSubmit, itemProps } = useForm<FormValues>({
    initialValues: {
      query: props.initValue.query,
      name: props.initValue.name,
    },
    validation: {
      query: (value) => {
        if (!value || value.trim().length === 0) {
          return "Query is required";
        }
      },
    },
    onSubmit: (values) => {
      pop();
      props.onSubmit({
        id: props.initValue.id,
        name: values.name,
        query: values.query.trim(),
      });
    },
  });
  return (
    <Form
      navigationTitle={props.title}
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={handleSubmit}></Action.SubmitForm>
        </ActionPanel>
      }
    >
      <Form.TextField title="Name" {...itemProps.name} />
      <Form.TextField title="Query" {...itemProps.query} />
    </Form>
  );
}
