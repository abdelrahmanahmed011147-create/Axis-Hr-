# Security Specification for AXIS GROUP HR SYSTEM

## Data Invariants
1.  **Attendance Independence**: An attendance record must belong to a valid employee.
2.  **Request Ownership**: Only the employee who created a request or an HR/GM admin can view/manage it.
3.  **Role Integrity**: Regular employees cannot update their own roles or the roles of others.
4.  **Temporal Integrity**: Attendance 'checkInTime' must be set upon creation and never modified to a past date.
5.  **Setting Protection**: Only HR/GM admins can modify system settings.
6.  **Audit Logs**: Audit logs are read-only for admins and append-only for the system.

## The "Dirty Dozen" Payloads (Deny Test)

1.  **Self-Promotion**: Employee attempts to update their role to `HR-MASTER`.
    ```json
    { "role": "HR-MASTER" } // Expected: PERMISSION_DENIED
    ```
2.  **Shadow Employee**: Creating an employee record without an authenticated session.
    ```json
    { "fullName": "Hacker", "role": "GM-MASTER" } // Expected: PERMISSION_DENIED
    ```
3.  **Attendance Spoofing**: Regular employee attempts to delete an attendance record.
    ```json
    // Operation: delete /attendance/{id} // Expected: PERMISSION_DENIED
    ```
4.  **Request Hijacking**: Employee A tries to approve Employee B's request.
    ```json
    { "status": "Approved" } // Expected: PERMISSION_DENIED (author checks)
    ```
5.  **Settings Poisoning**: Regular employee tries to change `workStartTime` in `settings`.
    ```json
    { "workStartTime": "12:00" } // Expected: PERMISSION_DENIED
    ```
6.  **Future attendance**: Setting a `checkInTime` in the future.
    ```json
    { "checkInTime": "2026-12-31T09:00:00Z" } // Expected: PERMISSION_DENIED (server timestamp check)
    ```
7.  **Resource Poisoning**: Providing a 1MB string for `employeeCode`.
    ```json
    { "employeeCode": "A".repeat(1000000) } // Expected: PERMISSION_DENIED (size check)
    ```
8.  **Unauthorized List**: Employee attempts to list all employees in the system.
    ```json
    // Operation: list /employees // Expected: PERMISSION_DENIED (unless admin)
    ```
9.  **Audit Log Cleanup**: Employee attempts to clear the `auditLogs` collection.
    ```json
    // Operation: delete /auditLogs/{id} // Expected: PERMISSION_DENIED
    ```
10. **Ghost Fields**: Creating an employee with an unauthorized `verified` field.
    ```json
    { "fullName": "John", "verified": true } // Expected: PERMISSION_DENIED (strict schema)
    ```
11. **Negative Delay**: Updating attendance with a negative `delayMinutes`.
    ```json
    { "delayMinutes": -50 } // Expected: PERMISSION_DENIED
    ```
12. **Status Skipping**: Skipping "Pending" status for a request and setting it directly to "Approved".
    ```json
    { "status": "Approved" } // Expected: PERMISSION_DENIED on create
    ```

## Test Runner (Logic Check)
The tests will verify that:
-   Admins (HR/GM) can read/write everything.
-   Employees can only read/write their own data for specific collections (attendance, requests).
-   Settings are read-only for employees.
-   Validation helpers enforce strict types and sizes.
