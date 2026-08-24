<?php

declare(strict_types=1);

use Illuminate\Foundation\Http\FormRequest;

final class DoctorProbeRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['email' => 'required|email'];
    }
}

it('reports a healthy package through the doctor', function (): void {
    config()->set('laranail.validation-js.endpoint.schemas', ['signup' => DoctorProbeRequest::class]);

    $this->artisan('laranail::validation-js.doctor')
        ->expectsOutputToContain('client rules')
        ->assertSuccessful();
});

it('fails the doctor on an allow-list entry that is not a FormRequest', function (): void {
    config()->set('laranail.validation-js.endpoint.schemas', ['broken' => stdClass::class]);

    $this->artisan('laranail::validation-js.doctor')->assertFailed();
});

it('fails the doctor on an allow-list entry whose class does not exist', function (): void {
    config()->set('laranail.validation-js.endpoint.schemas', ['ghost' => 'App\\Missing\\Request']);

    $this->artisan('laranail::validation-js.doctor')->assertFailed();
});
