import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { passwordSchema } from "./common";
import { fieldErrorMap, formErrorText, formatValidationMessage } from "./messages";

describe("form field errors", () => {
  it("turns Zod field errors into sentences under the field name", () => {
    const fields = fieldErrorMap({
      formErrors: [],
      fieldErrors: {
        email: ["Invalid email address"],
        name: ["Too small: expected string to have >=2 characters"],
        phone: ["Invalid input: expected string, received undefined"],
        schoolId: ["Invalid id"],
        role: ["Invalid option: expected one of PLATFORM_ADMIN"],
        routeCode: ["Invalid string: must match pattern"],
        imei: ["Enter the tracker IMEI."],
      },
    });

    assert.equal(fields.email, "Email must be a valid email address.");
    assert.equal(fields.name, "Name must be at least 2 characters.");
    assert.equal(fields.phone, "Phone is required.");
    assert.equal(fields.schoolId, "School is not valid.");
    assert.equal(fields.role, "Role is not a valid choice.");
    assert.equal(fields.routeCode, "Route code is not in the expected format.");
    assert.equal(fields.imei, "Enter the tracker IMEI.");
  });

  it("reads the first nested field error and ignores empty details", () => {
    assert.deepEqual(fieldErrorMap(null), {});
    assert.equal(fieldErrorMap({ fieldErrors: { className: ["Choose a class.", "Choose a class."] } }).className, "Choose a class.");
    assert.equal(
      fieldErrorMap({ fieldErrors: { location: { _errors: ["Confirm the pin before saving the place."] } } }).location,
      "Confirm the pin before saving the place.",
    );
  });

  it("keeps a form-level message separate from the field sentences", () => {
    const details = {
      formErrors: ["A student with this code already exists"],
      fieldErrors: { studentCode: ["Too big: expected string to have <=40 characters"] },
    };
    assert.equal(formErrorText(details), "A student with this code already exists.");
    assert.equal(formErrorText(null), "");
    assert.equal(
      formatValidationMessage(details),
      "A student with this code already exists. Student code must be 40 characters or fewer.",
    );
  });
});

describe("password rule", () => {
  it("accepts a password with a letter and a number", () => {
    assert.equal(passwordSchema.safeParse("ChangeMe123!").success, true);
  });

  it("rejects a password that is short, or missing a letter or a number", () => {
    for (const value of ["short", "longpassword", "12345678"]) {
      const result = passwordSchema.safeParse(value);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.issues[0]?.message, "Password must be at least 8 characters and include a letter and a number.");
      }
    }
  });
});
