{{--
    <x-laranail-validation-js::schema :request="StoreUserRequest::class" />
    or :rules="[...]" — both render the same inert JSON data island the
    directive does (see Support\RendersSchemas for the §10.5 reasoning).
--}}
@props(['request' => null, 'rules' => null, 'id' => 'default', 'nonce' => null])
{!! \Simtabi\Laranail\ValidationJs\Support\RendersSchemas::directive($request ?? $rules ?? [], $id, $nonce) !!}
