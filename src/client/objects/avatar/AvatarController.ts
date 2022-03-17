import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { AnimationAction, AnimationClip, Scene } from 'three'

class AvatarControllerProxy {
    animations: { [key: string]: { clip: AnimationClip, action: AnimationAction } };

    constructor(animations: { [key: string]: { clip: AnimationClip, action: AnimationAction } }) {
        this.animations = animations
    }
}

interface AvatarParams {
    scene: Scene
}

export class AvatarController {

    private scene: Scene
    private decceleration: THREE.Vector3
    private acceleration: THREE.Vector3
    private velocity: THREE.Vector3
    private animations: { [key: string]: { clip: AnimationClip, action: AnimationAction } }
    private input: AvatarControllerInput
    private stateMachine: CharacterFSM
    private avatarModel!: THREE.Object3D
    private mixer!: THREE.AnimationMixer
    private manager!: THREE.LoadingManager

    constructor({ scene }: AvatarParams) {
        this.scene = scene;
        this.decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0)
        this.acceleration = new THREE.Vector3(1, 0.25, 50.0)
        this.velocity = new THREE.Vector3(0, 0, 0)

        this.animations = {}
        this.input = new AvatarControllerInput()
        this.stateMachine = new CharacterFSM(
            new AvatarControllerProxy(this.animations)
        )
    }

    public async loadModels() {
        const PATH_TO_RESOURCES: string = './resources/avatar/';
        const loader = new GLTFLoader()
        loader.setPath(PATH_TO_RESOURCES)
        const gltf = await loader.loadAsync('avatar.glb')
        this.avatarModel = gltf.scene;
        const animations = gltf.animations;
        this.avatarModel.scale.setScalar(10.0)
        const MODEL_PART_TO_TEXTURE: { [key: string]: string } = {
            "EyeLeft": './resources/avatar/eye.jpg',
            "EyeRight": './resources/avatar/eye.jpg',
            "Wolf3D_Head": './resources/avatar/head.jpg',
            "Wolf3D_Body": './resources/avatar/body.jpg',
            "Wolf3D_Outfit_Top": './resources/avatar/outfit_top.jpg',
            "Wolf3D_Outfit_Bottom": './resources/avatar/outfit_bottom.jpg',
            "Wolf3D_Outfit_Footwear": './resources/avatar/outfit_footwear.jpg',
            "Wolf3D_Hair": './resources/avatar/hair.jpg',
            "Wolf3D_Teeth": './resources/avatar/teeth.jpg',
        };
        this.avatarModel.traverse(async (bodyPart) => {
            bodyPart.castShadow = true
            if ((<THREE.Mesh>bodyPart).isMesh) {
                const texture = await new THREE.TextureLoader().loadAsync(
                    MODEL_PART_TO_TEXTURE[bodyPart.name]
                );

                texture.flipY = false; // we flip the texture so that its the right way up

                const texture_mtl = new THREE.MeshBasicMaterial({
                    map: texture,
                    color: 0xffffff,
                });

                (<THREE.Mesh>bodyPart).material = texture_mtl;
                bodyPart.castShadow = true;
                bodyPart.receiveShadow = true;

            }
        })

        this.scene.add(this.avatarModel)

        this.mixer = new THREE.AnimationMixer(this.avatarModel)

        const loadAnimation = (animName: string) => {
            const clip = THREE.AnimationClip.findByName(animations, animName)
            console.info(clip);
            const action = this.mixer.clipAction(clip)

            this.animations[animName] = {
                clip,
                action
            }
        }

        loadAnimation('idle');
        loadAnimation('walking');
        this.stateMachine.setState('idle')
        console.info("creating this bitch")
    }

    public update(timeInSeconds: number) {
        if (!this.avatarModel) {
            return
        }

        this.stateMachine.update(timeInSeconds, this.input)

        const frameDecceleration = new THREE.Vector3(
            this.velocity.x * this.decceleration.x,
            this.velocity.y * this.decceleration.y,
            this.velocity.z * this.decceleration.z
        )
        frameDecceleration.multiplyScalar(timeInSeconds)
        frameDecceleration.z =
            Math.sign(frameDecceleration.z) *
            Math.min(Math.abs(frameDecceleration.z), Math.abs(this.velocity.z))

        this.velocity.add(frameDecceleration)

        const quaternion = new THREE.Quaternion()
        const vector = new THREE.Vector3()
        const avatarModelQuaternionClone = this.avatarModel.quaternion.clone()

        const acc = this.acceleration.clone()
        if (this.input.keys.shift) {
            acc.multiplyScalar(2.0)
        }

        if (this.input.keys.forward) {
            this.velocity.z += acc.z * timeInSeconds
        }
        if (this.input.keys.backward) {
            this.velocity.z -= acc.z * timeInSeconds
        }
        if (this.input.keys.left) {
            vector.set(0, 1, 0)
            quaternion.setFromAxisAngle(
                vector,
                4.0 * Math.PI * timeInSeconds * this.acceleration.y
            )
            avatarModelQuaternionClone.multiply(quaternion)
        }
        if (this.input.keys.right) {
            vector.set(0, 1, 0)
            quaternion.setFromAxisAngle(
                vector,
                4.0 * -Math.PI * timeInSeconds * this.acceleration.y
            )
            avatarModelQuaternionClone.multiply(quaternion)
        }

        this.avatarModel.quaternion.copy(avatarModelQuaternionClone)

        const oldPosition = new THREE.Vector3()
        oldPosition.copy(this.avatarModel.position)

        const forward = new THREE.Vector3(0, 0, 1)
        forward.applyQuaternion(this.avatarModel.quaternion)
        forward.normalize()

        const sideways = new THREE.Vector3(1, 0, 0)
        sideways.applyQuaternion(this.avatarModel.quaternion)
        sideways.normalize()

        sideways.multiplyScalar(this.velocity.x * timeInSeconds)
        forward.multiplyScalar(this.velocity.z * timeInSeconds)

        this.avatarModel.position.add(forward)
        this.avatarModel.position.add(sideways)

        oldPosition.copy(this.avatarModel.position)

        if (this.mixer) {
            this.mixer.update(timeInSeconds)
        }
    }
}

class AvatarControllerInput {
    public keys!: { [key: string]: boolean };
    constructor() {
        this._Init()
    }

    _Init() {
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            space: false,
            shift: false
        }
        document.addEventListener('keydown', e => this._onKeyDown(e), false)
        document.addEventListener('keyup', e => this._onKeyUp(e), false)
    }

    _onKeyDown(event: KeyboardEvent) {
        switch (event.keyCode) {
            case 87: // w
                this.keys.forward = true
                break
            case 65: // a
                this.keys.left = true
                break
            case 83: // s
                this.keys.backward = true
                break
            case 68: // d
                this.keys.right = true
                break
            case 32: // SPACE
                this.keys.space = true
                break
            case 16: // SHIFT
                this.keys.shift = true
                break
        }
    }

    _onKeyUp(event: KeyboardEvent) {
        switch (event.keyCode) {
            case 87: // w
                this.keys.forward = false
                break
            case 65: // a
                this.keys.left = false
                break
            case 83: // s
                this.keys.backward = false
                break
            case 68: // d
                this.keys.right = false
                break
            case 32: // SPACE
                this.keys.space = false
                break
            case 16: // SHIFT
                this.keys.shift = false
                break
        }
    }
}

class FiniteStateMachine {
    public currentState?: State;
    public states: { [key: string]: typeof State };
    public proxy: AvatarControllerProxy

    constructor(proxy: AvatarControllerProxy) {
        this.states = {}
        this.proxy = proxy; 
        this.currentState = undefined
    }

    public addState(name: string, type: typeof State) {
        this.states[name] = type
    }

    public setState(name: string) {
        const prevState = this.currentState

        if (prevState) {
            if (prevState.name == name) {
                return
            }
            prevState.exit()
        }

        const state = new this.states[name](this, name)
        console.info(state);
        this.currentState = state
        state.enter(prevState)
    }

    update(timeElapsed: number, input: AvatarControllerInput) {
        if (this.currentState) {
            this.currentState.update(timeElapsed, input)
        }
    }
}

class CharacterFSM extends FiniteStateMachine {
    constructor(proxy: AvatarControllerProxy) {
        console.info(proxy)
        super(proxy)
        this.init()
    }

    init() {
        this.addState('idle', IdleState)
        this.addState('walking', WalkState)
    }
}

class State {
    public name: string
    public parent: FiniteStateMachine

    constructor(parent: FiniteStateMachine, name: string) {
        this.parent = parent
        this.name = name
    }

    public enter(_prevState?: State) { }

    public exit() { }

    public update(_timeElapsed: number, _input: AvatarControllerInput) { }
}

class WalkState extends State {
    constructor(...params: ConstructorParameters<typeof State>) {
        super(...params)
    }

    enter(prevState?: State) {
        const curAction = this.parent.proxy.animations.walking.action
        if (prevState) {
            const prevAction = this.parent.proxy.animations[prevState.name].action

            curAction.enabled = true


            curAction.time = 0.0
            curAction.setEffectiveTimeScale(1.0)
            curAction.setEffectiveWeight(1.0)


            curAction.crossFadeFrom(prevAction, 0.5, true)
            curAction.play()
        } else {
            curAction.play()
        }
    }

    exit() { }

    update(_timeElapsed: number, input: AvatarControllerInput) { 
        if (input.keys.forward || input.keys.backward) {
            return;
          }
        this.parent.setState('idle')
    }
}

class IdleState extends State {
    constructor(...params: ConstructorParameters<typeof State>) {
        super(...params)
    }

    get Name() {
        return 'idle'
    }

    enter(prevState?: State) {
        const idleAction = this.parent.proxy.animations.idle.action
        if (prevState) {
            const prevAction = this.parent.proxy.animations[prevState.name].action
            idleAction.time = 0.0
            idleAction.enabled = true
            idleAction.setEffectiveTimeScale(1.0)
            idleAction.setEffectiveWeight(1.0)
            idleAction.crossFadeFrom(prevAction, 0.5, true)
            idleAction.play()
        } else {
            idleAction.play()
        }
    }

    exit() { }

    update(_timeElapsed: number, input: AvatarControllerInput) {
        if (input.keys.forward || input.keys.backward) {
            this.parent.setState('walking')
        }
    }
}
